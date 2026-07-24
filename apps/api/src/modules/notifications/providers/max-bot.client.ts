import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type MaxPortalInviteDelivery = 'sent' | 'failed' | 'skipped_not_configured';

@Injectable()
export class MaxBotClient {
  constructor(private readonly prisma: PrismaService) {}

  async sendPortalInvite(ownerId: string, maxUserId: string, inviteToken: string): Promise<MaxPortalInviteDelivery> {
    const botToken = process.env.MAX_BOT_TOKEN?.trim();
    const portalBaseUrl = normalizeBaseUrl(process.env.CLIENT_PORTAL_PUBLIC_URL);

    if (!botToken || !portalBaseUrl) {
      return 'skipped_not_configured';
    }

    const body = 'TemichevVet: откройте личный кабинет по кнопке ниже.';
    const portalUrl = `${portalBaseUrl}/portal/${encodeURIComponent(inviteToken)}?via=max`;
    const message = await this.prisma.notificationOutbox.create({
      data: {
        ownerId,
        channel: NotificationChannel.MAX,
        recipient: maxUserId,
        body,
        status: NotificationStatus.SENDING,
        attempts: 1,
        scheduledAt: new Date(),
      },
    });

    try {
      const apiBaseUrl = normalizeBaseUrl(process.env.MAX_API_BASE_URL) || 'https://platform-api2.max.ru';
      const response = await fetch(`${apiBaseUrl}/messages?user_id=${encodeURIComponent(maxUserId)}`, {
        method: 'POST',
        headers: {
          Authorization: botToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: body,
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'link', text: 'Открыть личный кабинет', url: portalUrl }]],
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`MAX API HTTP ${response.status}`);
      }

      await this.prisma.notificationOutbox.update({
        where: { id: message.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), lastError: null },
      });

      return 'sent';
    } catch (error) {
      await this.prisma.notificationOutbox.update({
        where: { id: message.id },
        data: { status: NotificationStatus.FAILED, lastError: getErrorMessage(error) },
      });

      return 'failed';
    }
  }
}

function normalizeBaseUrl(value: string | undefined) {
  return value?.trim().replace(/\/+$/, '') ?? '';
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка MAX';
  return message.slice(0, 500);
}
