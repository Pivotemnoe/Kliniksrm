import { ConflictException, Injectable } from '@nestjs/common';
import { MessengerChannel, PortalInviteChannel, PortalInviteStatus, Prisma } from './generated/client';
import { PrismaService } from './prisma.service';
import { assertSecret, hashToken } from './security';
import { TelegramBotClient } from './telegram-bot.client';
import { randomBytes } from 'node:crypto';

@Injectable()
export class TelegramWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBotClient: TelegramBotClient,
  ) {}

  async handle(secret: string | undefined, update: unknown) {
    assertSecret(secret, process.env.TELEGRAM_WEBHOOK_SECRET, 'Секрет webhook Telegram не настроен');
    const start = parseTelegramStart(update);

    if (!start) {
      return { ok: true, handled: false };
    }

    if (!start.payload) {
      return this.loginLinkedOwner(start.userId, start.chatId);
    }

    const botStarted = { ...start, payload: start.payload };

    const invitation = await this.prisma.portalInvitation.findUnique({
      where: { tokenHash: hashToken(botStarted.payload) },
      select: { ownerId: true, channel: true, status: true, expiresAt: true },
    });

    if (
      !invitation
      || (invitation.channel !== PortalInviteChannel.TELEGRAM && invitation.channel !== PortalInviteChannel.WEB)
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

  private async loginLinkedOwner(userId: string, chatId: string) {
    const binding = await this.prisma.messengerBinding.findUnique({
      where: {
        channel_externalUserId: {
          channel: MessengerChannel.TELEGRAM,
          externalUserId: userId,
        },
      },
      select: { ownerId: true, chatId: true },
    });

    if (!binding || (binding.chatId && binding.chatId !== chatId)) {
      return { ok: true, handled: false, reason: 'account_not_linked' };
    }

    const token = randomBytes(32).toString('hex');
    await this.prisma.portalInvitation.create({
      data: {
        ownerId: binding.ownerId,
        tokenHash: hashToken(token),
        channel: PortalInviteChannel.WEB,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    await this.telegramBotClient.sendPortalButton(chatId, token);
    return { ok: true, handled: true, action: 'login_link_created' };
  }
}

export function parseTelegramBotStarted(update: unknown) {
  const start = parseTelegramStart(update);
  return start?.payload ? { payload: start.payload, userId: start.userId, chatId: start.chatId } : null;
}

export function parseTelegramStart(update: unknown) {
  if (!isRecord(update) || !isRecord(update.message)) {
    return null;
  }

  const message = update.message;
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  const match = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{32,128}))?$/);
  const from = isRecord(message.from) ? message.from : null;
  const chat = isRecord(message.chat) ? message.chat : null;
  const userId = normalizeIntegerId(from?.id);
  const chatId = normalizeIntegerId(chat?.id);

  if (!match || !userId || !chatId || userId !== chatId) {
    return null;
  }

  return { payload: match[1] ?? null, userId, chatId };
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
