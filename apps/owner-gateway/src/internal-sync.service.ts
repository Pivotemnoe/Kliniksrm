import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessengerChannel, PortalInviteChannel, PortalInviteStatus, Prisma } from './generated/client';
import { PrismaService } from './prisma.service';
import { hashToken, normalizeBaseUrl } from './security';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { UpsertOwnerSnapshotDto } from './dto/upsert-owner-snapshot.dto';
import { SendOwnerMessageDto } from './dto/send-owner-message.dto';
import { MaxBotClient } from './max-bot.client';
import { TelegramBotClient } from './telegram-bot.client';
import { OwnerPushMessage, WebPushService } from './web-push.service';

const allowedSnapshotKeys = new Set(['owner', 'animals', 'appointments', 'visits', 'bills', 'notifications', 'syncedAt']);

@Injectable()
export class InternalSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maxBotClient: MaxBotClient,
    private readonly telegramBotClient: TelegramBotClient,
    private readonly webPushService: WebPushService,
  ) {}

  async upsertSnapshot(ownerId: string, dto: UpsertOwnerSnapshotDto) {
    assertSafeSnapshot(dto.payload);
    const sourceUpdatedAt = new Date(dto.sourceUpdatedAt);
    const payload = dto.payload as Prisma.InputJsonValue;

    const previous = await this.prisma.ownerSnapshot.findUnique({
      where: { ownerId },
      select: { payload: true },
    });

    const saved = await this.prisma.ownerSnapshot.upsert({
      where: { ownerId },
      create: {
        ownerId,
        displayName: dto.displayName.trim(),
        payload,
        sourceVersion: dto.sourceVersion.trim(),
        sourceUpdatedAt,
      },
      update: {
        displayName: dto.displayName.trim(),
        payload,
        sourceVersion: dto.sourceVersion.trim(),
        sourceUpdatedAt,
        syncedAt: new Date(),
      },
      select: { ownerId: true, sourceVersion: true, sourceUpdatedAt: true, syncedAt: true },
    });

    if (previous) {
      const previousIds = new Set(readSnapshotNotifications(previous.payload).map((message) => message.id));
      const newMessages = readSnapshotNotifications(dto.payload).filter((message) => !previousIds.has(message.id));
      if (newMessages.length) {
        void this.webPushService.sendNewMessages(ownerId, newMessages).catch(() => undefined);
      }
    }

    return saved;
  }

  async getStatus(ownerId: string) {
    const owner = await this.prisma.ownerSnapshot.findUnique({
      where: { ownerId },
      select: {
        syncedAt: true,
        bindings: { select: { channel: true } },
      },
    });

    return {
      hasSnapshot: Boolean(owner),
      maxLinked: owner?.bindings.some((binding) => binding.channel === 'MAX') ?? false,
      telegramLinked: owner?.bindings.some((binding) => binding.channel === 'TELEGRAM') ?? false,
      syncedAt: owner?.syncedAt ?? null,
    };
  }

  async createInvitation(ownerId: string, dto: CreateInvitationDto) {
    const owner = await this.prisma.ownerSnapshot.findUnique({ where: { ownerId }, select: { ownerId: true } });

    if (!owner) {
      throw new NotFoundException('Сначала синхронизируйте разрешённый снимок владельца');
    }

    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date()) {
      throw new BadRequestException('Срок действия приглашения уже истёк');
    }

    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.portalInvitation.updateMany({
        where: { ownerId, status: PortalInviteStatus.ACTIVE },
        data: { status: PortalInviteStatus.REVOKED },
      });

      return tx.portalInvitation.create({
        data: {
          ownerId,
          tokenHash: hashToken(dto.token.trim()),
          channel: dto.channel,
          expiresAt,
        },
        select: { id: true, ownerId: true, channel: true, expiresAt: true, createdAt: true },
      });
    });

    const automaticDelivery = await this.deliverToLinkedMessenger(ownerId, dto.channel, dto.token.trim());

    return {
      ...invitation,
      deliveryUrl: buildDeliveryUrl(dto.channel, dto.token.trim()),
      automaticDelivery,
    };
  }

  async revokeInvitation(ownerId: string) {
    const result = await this.prisma.portalInvitation.updateMany({
      where: { ownerId, status: PortalInviteStatus.ACTIVE },
      data: { status: PortalInviteStatus.REVOKED },
    });

    return { ok: true, revoked: result.count };
  }

  async sendMessage(ownerId: string, dto: SendOwnerMessageDto) {
    const owner = await this.prisma.ownerSnapshot.findUnique({ where: { ownerId }, select: { ownerId: true } });
    if (!owner) {
      throw new NotFoundException('Снимок владельца не найден');
    }

    const text = [dto.subject?.trim(), dto.body.trim()].filter(Boolean).join('\n\n');
    const channels = resolveDeliveryChannels(dto.channel, dto.preferredChannel);

    for (const channel of channels) {
      const binding = await this.prisma.messengerBinding.findUnique({
        where: { ownerId_channel: { ownerId, channel } },
        select: { externalUserId: true, chatId: true },
      });

      if (!binding) {
        continue;
      }

      try {
        if (channel === MessengerChannel.MAX) {
          await this.maxBotClient.sendMessage(binding.externalUserId, text);
        } else {
          await this.telegramBotClient.sendMessage(binding.chatId ?? binding.externalUserId, text);
        }
        return { status: 'sent' as const, channel };
      } catch {
        return { status: 'failed' as const, channel };
      }
    }

    return { status: 'not_linked' as const, channel: null };
  }

  async revokeAccess(ownerId: string) {
    const now = new Date();
    const [invitations, sessions] = await this.prisma.$transaction([
      this.prisma.portalInvitation.updateMany({
        where: { ownerId, status: PortalInviteStatus.ACTIVE },
        data: { status: PortalInviteStatus.REVOKED },
      }),
      this.prisma.portalSession.updateMany({
        where: { ownerId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    return { ok: true, revokedInvitations: invitations.count, revokedSessions: sessions.count };
  }

  async resetConnection(ownerId: string, channelValue: string) {
    const channel = normalizeMessengerChannel(channelValue);
    const owner = await this.prisma.ownerSnapshot.findUnique({ where: { ownerId }, select: { ownerId: true } });

    if (!owner) {
      throw new NotFoundException('Снимок владельца не найден');
    }

    const now = new Date();
    const [invitations, sessions, bindings] = await this.prisma.$transaction([
      this.prisma.portalInvitation.updateMany({
        where: { ownerId, status: PortalInviteStatus.ACTIVE },
        data: { status: PortalInviteStatus.REVOKED },
      }),
      this.prisma.portalSession.updateMany({
        where: { ownerId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.messengerBinding.deleteMany({
        where: { ownerId, channel },
      }),
    ]);

    return {
      ok: true,
      channel,
      revokedInvitations: invitations.count,
      revokedSessions: sessions.count,
      removedBindings: bindings.count,
    };
  }

  private async deliverToLinkedMessenger(ownerId: string, channel: PortalInviteChannel, token: string) {
    if (channel === PortalInviteChannel.WEB) {
      return 'manual_required' as const;
    }

    const binding = await this.prisma.messengerBinding.findUnique({
      where: { ownerId_channel: { ownerId, channel } },
      select: { externalUserId: true, chatId: true },
    });

    if (!binding) {
      return 'manual_required' as const;
    }

    try {
      if (channel === MessengerChannel.MAX) {
        await this.maxBotClient.sendPortalButton(binding.externalUserId, token);
      } else {
        await this.telegramBotClient.sendPortalButton(binding.chatId ?? binding.externalUserId, token);
      }
      return 'sent' as const;
    } catch {
      return 'failed' as const;
    }
  }
}

function assertSafeSnapshot(payload: Record<string, unknown>) {
  const unexpectedKeys = Object.keys(payload).filter((key) => !allowedSnapshotKeys.has(key));
  if (unexpectedKeys.length) {
    throw new BadRequestException(`Снимок содержит запрещённые разделы: ${unexpectedKeys.join(', ')}`);
  }

  if (!payload.owner || !Array.isArray(payload.animals)) {
    throw new BadRequestException('В снимке обязательны владелец и список пациентов');
  }
}

function readSnapshotNotifications(payload: unknown): OwnerPushMessage[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }
  const notifications = (payload as { notifications?: unknown }).notifications;
  if (!Array.isArray(notifications)) {
    return [];
  }

  return notifications.flatMap((notification) => {
    if (!notification || typeof notification !== 'object' || Array.isArray(notification)) {
      return [];
    }
    const value = notification as { id?: unknown; subject?: unknown; body?: unknown };
    if (typeof value.id !== 'string' || typeof value.body !== 'string') {
      return [];
    }
    return [{
      id: value.id,
      subject: typeof value.subject === 'string' ? value.subject : null,
      body: value.body,
    }];
  });
}

function buildDeliveryUrl(channel: PortalInviteChannel, token: string) {
  const publicUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_PUBLIC_URL);
  const activationUrl = publicUrl ? `${publicUrl}/portal/activate?token=${encodeURIComponent(token)}` : null;

  if (channel === PortalInviteChannel.MAX) {
    const botName = normalizeBotName(process.env.MAX_BOT_NAME);
    return botName ? `https://max.ru/${botName}?start=${encodeURIComponent(token)}` : activationUrl;
  }

  if (channel === PortalInviteChannel.TELEGRAM) {
    const botName = normalizeBotName(process.env.TELEGRAM_BOT_USERNAME);
    return botName ? `https://t.me/${botName}?start=${encodeURIComponent(token)}` : activationUrl;
  }

  return activationUrl;
}

function resolveDeliveryChannels(channel: SendOwnerMessageDto['channel'], preferred?: SendOwnerMessageDto['preferredChannel']) {
  if (channel === 'MAX') {
    return [MessengerChannel.MAX];
  }
  if (channel === 'TELEGRAM') {
    return [MessengerChannel.TELEGRAM];
  }

  return Array.from(new Set([
    preferred === 'TELEGRAM' ? MessengerChannel.TELEGRAM : MessengerChannel.MAX,
    MessengerChannel.MAX,
    MessengerChannel.TELEGRAM,
  ]));
}

function normalizeMessengerChannel(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === MessengerChannel.MAX || normalized === MessengerChannel.TELEGRAM) {
    return normalized;
  }

  throw new BadRequestException('Поддерживаются только подключения MAX и Telegram');
}

function normalizeBotName(value: string | undefined) {
  return value?.trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?max\.ru\//i, '').replace(/\/+$/, '') ?? '';
}
