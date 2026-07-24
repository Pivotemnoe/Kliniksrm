import { ConflictException, Injectable } from '@nestjs/common';
import { MessengerChannel, PortalInviteChannel, PortalInviteStatus, Prisma } from './generated/client';
import { MaxBotClient } from './max-bot.client';
import { PrismaService } from './prisma.service';
import { assertSecret, hashToken } from './security';

@Injectable()
export class MaxWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maxBotClient: MaxBotClient,
  ) {}

  async handle(secret: string | undefined, update: unknown) {
    assertSecret(secret, process.env.MAX_WEBHOOK_SECRET, 'Секрет webhook MAX не настроен');
    const botStarted = parseBotStarted(update);

    if (!botStarted) {
      return { ok: true, handled: false };
    }

    const invitation = await this.prisma.portalInvitation.findUnique({
      where: { tokenHash: hashToken(botStarted.payload) },
      include: { owner: { select: { ownerId: true } } },
    });

    if (
      !invitation ||
      invitation.channel !== PortalInviteChannel.MAX ||
      invitation.status !== PortalInviteStatus.ACTIVE ||
      invitation.expiresAt <= new Date()
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
      await this.prisma.messengerBinding.upsert({
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

function parseBotStarted(update: unknown) {
  if (!isRecord(update) || update.update_type !== 'bot_started') {
    return null;
  }

  const payload = typeof update.payload === 'string' ? update.payload.trim() : '';
  const user = isRecord(update.user) ? update.user : null;
  const maxUserId = normalizeIntegerId(user?.user_id);
  const chatId = normalizeIntegerId(update.chat_id);

  if (!payload || payload.length > 128 || !maxUserId) {
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
