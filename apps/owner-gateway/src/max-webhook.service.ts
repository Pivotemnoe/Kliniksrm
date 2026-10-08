import { ClinicChatService } from './clinic-chat.service';
import { ConflictException, Injectable, Optional } from '@nestjs/common';
import { OwnerNotificationService } from './owner-notification.service';
import { MessengerChannel, PortalInviteChannel, PortalInviteStatus, Prisma } from './generated/client';
import { MaxBotClient } from './max-bot.client';
import { PrismaService } from './prisma.service';
import { assertSecret, hashToken } from './security';

@Injectable()
export class MaxWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maxBotClient: MaxBotClient,
    private readonly clinicChat: ClinicChatService,
    @Optional() private readonly notifications?: OwnerNotificationService,
  ) {}

  async handle(secret: string | undefined, update: unknown) {
    assertSecret(secret, process.env.MAX_WEBHOOK_SECRET, 'Секрет webhook MAX не настроен');
    const notificationMessage = parseMaxMessage(update);
    if (notificationMessage && /^(?:\/stop(?:@\w+)?|стоп|отписаться)\s*$/i.test(notificationMessage.text.trim())) {
      await this.notifications?.unsubscribeByMax(notificationMessage.userId);
    }
    if (process.env.CLINIC_ASSISTANT_ENABLED === 'true') {
      const incoming = parseMaxMessage(update);
      if (incoming) {
        await this.clinicChat.fromMax(incoming.userId, `max:${incoming.id}`, incoming.text);
        return { ok: true, handled: true };
      }
    }
    const botStarted = parseMaxBotStarted(update);

    if (!botStarted) {
      return { ok: true, handled: false };
    }

    if (process.env.CLINIC_ASSISTANT_ENABLED === 'true' && await this.clinicChat.bindMax(botStarted.payload, botStarted.maxUserId)) return { ok: true, handled: true };
    const invitation = await this.prisma.portalInvitation.findUnique({
      where: { tokenHash: hashToken(botStarted.payload) },
      include: { owner: { select: { ownerId: true } } },
    });

    if (
      !invitation ||
      (invitation.channel !== PortalInviteChannel.MAX && invitation.channel !== PortalInviteChannel.WEB) ||
      invitation.status !== PortalInviteStatus.ACTIVE ||
      invitation.expiresAt <= new Date() ||
      (invitation.maxLinkedUserId && invitation.maxLinkedUserId !== botStarted.maxUserId)
    ) {
      return { ok: true, handled: false };
    }

    const conflict = await this.prisma.messengerBinding.findUnique({
      where: {
        channel_externalUserId: {
          channel: MessengerChannel.MAX,
          externalUserId: botStarted.maxUserId,
        },
      },
      select: { ownerId: true },
    });

    if (conflict && conflict.ownerId !== invitation.ownerId) {
      return { ok: true, handled: false, reason: 'account_already_linked' };
    }

    try {
      await this.prisma.$transaction(async tx => {
      const linked = await tx.portalInvitation.updateMany({ where: { id: invitation.id, status: 'ACTIVE', expiresAt: { gt: new Date() }, OR: [{ maxLinkedUserId: null }, { maxLinkedUserId: botStarted.maxUserId }] }, data: { maxLinkedUserId: botStarted.maxUserId } });
      if (!linked.count) throw new ConflictException('Приглашение уже использовано');
      await tx.messengerBinding.upsert({
        where: {
          ownerId_channel: {
            ownerId: invitation.ownerId,
            channel: MessengerChannel.MAX,
          },
        },
        create: {
          ownerId: invitation.ownerId,
          channel: MessengerChannel.MAX,
          externalUserId: botStarted.maxUserId,
          chatId: botStarted.chatId,
        },
        update: {
          externalUserId: botStarted.maxUserId,
          chatId: botStarted.chatId,
        },
      });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Этот аккаунт MAX уже связан с другим владельцем');
      }
      throw error;
    }

    await this.maxBotClient.sendPortalButton(botStarted.maxUserId, botStarted.payload);
    return { ok: true, handled: true };
  }
}

export function parseMaxBotStarted(update: unknown) {
  if (!isRecord(update) || update.update_type !== 'bot_started') {
    return null;
  }

  const payload = typeof update.payload === 'string' ? update.payload.trim() : '';
  const user = isRecord(update.user) ? update.user : null;
  const maxUserId = normalizeIntegerId(user?.user_id);
  const chatId = normalizeIntegerId(update.chat_id);

  if (!/^[A-Za-z0-9_-]{32,128}$/.test(payload) || !maxUserId) {
    return null;
  }

  return { payload, maxUserId, chatId: chatId || null };
}

function normalizeIntegerId(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return String(value);
  }

  return typeof value === 'string' && /^\d+$/.test(value) ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Accept only direct human messages, never posts, groups or bot echoes.
export function parseMaxMessage(update: unknown) {
  if (!isRecord(update) || update.update_type !== 'message_created' || !isRecord(update.message)) return null;
  const message = update.message;
  const sender = isRecord(message.sender) ? message.sender : null;
  const recipient = isRecord(message.recipient) ? message.recipient : null;
  const body = isRecord(message.body) ? message.body : null;
  if (!sender || sender.is_bot === true || recipient?.chat_type !== 'dialog') return null;
  const userId = normalizeIntegerId(sender.user_id);
  const id = typeof body?.mid === 'string' ? body.mid : '';
  const text = typeof body?.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 4000) : '[Вложение: просмотрите в MAX]';
  if (!userId || !id || id.length > 180) return null;
  return { userId, id, text };
}
