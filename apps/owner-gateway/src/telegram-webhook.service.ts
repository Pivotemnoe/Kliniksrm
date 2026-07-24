import { ConflictException, Injectable } from '@nestjs/common';
import { MessengerChannel, PortalInviteChannel, PortalInviteStatus, Prisma } from './generated/client';
import { PrismaService } from './prisma.service';
import { assertSecret, hashToken } from './security';
import { TelegramBotClient } from './telegram-bot.client';

@Injectable()
export class TelegramWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBotClient: TelegramBotClient,
  ) {}

  async handle(secret: string | undefined, update: unknown) {
    assertSecret(secret, process.env.TELEGRAM_WEBHOOK_SECRET, 'Секрет webhook Telegram не настроен');
    const botStarted = parseBotStarted(update);

    if (!botStarted) {
      return { ok: true, handled: false };
    }

    const invitation = await this.prisma.portalInvitation.findUnique({
      where: { tokenHash: hashToken(botStarted.payload) },
      select: { ownerId: true, channel: true, status: true, expiresAt: true },
    });

    if (
      !invitation
      || invitation.channel !== PortalInviteChannel.TELEGRAM
      || invitation.status !== PortalInviteStatus.ACTIVE
      || invitation.expiresAt <= new Date()
    ) {
      return { ok: true, handled: false };
    }

    const conflict = await this.prisma.messengerBinding.findUnique({
      where: {
        channel_externalUserId: {
          channel: MessengerChannel.TELEGRAM,
          externalUserId: botStarted.userId,
        },
      },
      select: { ownerId: true },
    });

    if (conflict && conflict.ownerId !== invitation.ownerId) {
      return { ok: true, handled: false, reason: 'account_already_linked' };
    }

    try {
      await this.prisma.messengerBinding.upsert({
        where: { ownerId_channel: { ownerId: invitation.ownerId, channel: MessengerChannel.TELEGRAM } },
        create: {
          ownerId: invitation.ownerId,
          channel: MessengerChannel.TELEGRAM,
          externalUserId: botStarted.userId,
          chatId: botStarted.chatId,
        },
        update: { externalUserId: botStarted.userId, chatId: botStarted.chatId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Этот аккаунт Telegram уже связан с другим владельцем');
      }
      throw error;
    }

    await this.telegramBotClient.sendPortalButton(botStarted.chatId, botStarted.payload);
    return { ok: true, handled: true };
  }
}

function parseBotStarted(update: unknown) {
  if (!isRecord(update) || !isRecord(update.message)) {
    return null;
  }

  const message = update.message;
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  const match = text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{32,128})$/);
  const from = isRecord(message.from) ? message.from : null;
  const chat = isRecord(message.chat) ? message.chat : null;
  const userId = normalizeIntegerId(from?.id);
  const chatId = normalizeIntegerId(chat?.id);

  if (!match || !userId || !chatId) {
    return null;
  }

  return { payload: match[1], userId, chatId };
}

function normalizeIntegerId(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return String(value);
  }
  return typeof value === 'string' && /^-?\d+$/.test(value) ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
