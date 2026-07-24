import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from './prisma.service';

export type OwnerPushMessage = {
  id: string;
  subject: string | null;
  body: string;
};

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);

  constructor(private readonly prisma: PrismaService) {}

  getPublicConfig() {
    const vapid = getVapidDetails();
    return {
      available: Boolean(vapid),
      publicKey: vapid?.publicKey ?? null,
    };
  }

  async sendNewMessages(ownerId: string, messages: OwnerPushMessage[]) {
    const vapid = getVapidDetails();
    if (!vapid || !messages.length) {
      return;
    }

    const subscriptions = await this.prisma.portalPushSubscription.findMany({
      where: {
        ownerId,
        disabledAt: null,
        session: { revokedAt: null, expiresAt: { gt: new Date() } },
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true, failureCount: true },
    });
    if (!subscriptions.length) {
      return;
    }

    const newest = messages[0];
    const payload = JSON.stringify({
      title: newest.subject?.trim() || 'Новое сообщение TemichevVet',
      body: messages.length > 1 ? `Новых сообщений: ${messages.length}` : newest.body,
      url: '/portal?section=notifications',
      tag: 'temichevvet-owner-messages',
      badge: Math.max(1, messages.length),
    });

    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 86_400, vapidDetails: vapid, timeout: 10_000 },
        );
        await this.prisma.portalPushSubscription.update({
          where: { id: subscription.id },
          data: { failureCount: 0, disabledAt: null, lastSuccessAt: new Date() },
        });
      } catch (error) {
        const statusCode = typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : null;
        if (statusCode === 404 || statusCode === 410) {
          await this.prisma.portalPushSubscription.delete({ where: { id: subscription.id } });
          return;
        }

        const failureCount = subscription.failureCount + 1;
        await this.prisma.portalPushSubscription.update({
          where: { id: subscription.id },
          data: {
            failureCount,
            ...(failureCount >= 5 ? { disabledAt: new Date() } : {}),
          },
        });
        this.logger.warn(`Push владельца не доставлен, код: ${statusCode ?? 'network'}`);
      }
    }));
  }
}

function getVapidDetails() {
  const subject = process.env.OWNER_GATEWAY_VAPID_SUBJECT?.trim();
  const publicKey = process.env.OWNER_GATEWAY_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.OWNER_GATEWAY_VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) {
    return null;
  }
  return { subject, publicKey, privateKey };
}
