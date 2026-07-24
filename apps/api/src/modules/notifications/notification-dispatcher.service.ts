import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnerGatewayClient, OwnerMessengerChannel } from './providers/owner-gateway.client';

const MAX_DELIVERY_ATTEMPTS = 5;
const STUCK_DELIVERY_MINUTES = 10;

@Injectable()
export class NotificationDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerGatewayClient: OwnerGatewayClient,
  ) {}

  async onApplicationBootstrap() {
    await this.recoverStuckDeliveries();
    void this.tick();
    this.timer = setInterval(() => void this.tick(), getDispatchIntervalMs());
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const items = await this.prisma.notificationOutbox.findMany({
        where: {
          channel: NotificationChannel.MESSENGER,
          status: NotificationStatus.QUEUED,
          scheduledAt: { lte: new Date() },
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        take: 20,
        include: {
          owner: { select: { id: true, fullName: true, preferredNotificationChannel: true } },
        },
      });

      for (const item of items) {
        await this.dispatch(item);
      }
    } catch (error) {
      this.logger.error(`Не удалось обработать очередь уведомлений: ${errorMessage(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async dispatch(item: NotificationDispatchItem) {
    const claim = await this.prisma.notificationOutbox.updateMany({
      where: { id: item.id, status: NotificationStatus.QUEUED },
      data: {
        status: NotificationStatus.SENDING,
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    if (!claim.count) {
      return;
    }

    const attempt = item.attempts + 1;
    if (!item.ownerId || !item.owner) {
      await this.fail(item.id, 'Владелец для отправки не указан');
      return;
    }

    if (item.channel !== NotificationChannel.MESSENGER) {
      await this.fail(item.id, `Канал ${item.channel} пока не подключён к автоматической отправке`);
      return;
    }

    let delivery = readDeliveryState(item.metadata);
    let currentMetadata: unknown = item.metadata;

    if (!delivery.portalDeliveredAt) {
      const portalDeliveredAt = new Date();
      const pendingMetadata = writeDeliveryState(item.metadata, {
        ...delivery,
        portalDeliveredAt: portalDeliveredAt.toISOString(),
      });
      await this.prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { metadata: pendingMetadata },
      });

      const portalSync = await this.ownerGatewayClient.syncSnapshot({
        ownerId: item.ownerId,
        displayName: item.owner.fullName,
      });

      if (portalSync !== 'synced') {
        await this.prisma.notificationOutbox.update({
          where: { id: item.id },
          data: { metadata: writeDeliveryState(pendingMetadata, { ...delivery, portalDeliveredAt: null }) },
        });
        await this.retryOrFail(
          item.id,
          attempt,
          portalSync === 'skipped_not_configured'
            ? 'Публикация в личном кабинете пока не настроена'
            : 'Не удалось обновить личный кабинет',
        );
        return;
      }

      delivery = { ...delivery, portalDeliveredAt: portalDeliveredAt.toISOString() };
      currentMetadata = pendingMetadata;
    }

    const pendingChannels = delivery.mode === 'EXPLICIT'
      ? delivery.messengerChannels.filter((channel) => !delivery.deliveredMessengerChannels.includes(channel))
      : (delivery.deliveredMessengerChannels.length ? [] : ['AUTO'] as const);

    if (!pendingChannels.length) {
      await this.complete(item.id);
      return;
    }

    for (const requestedChannel of pendingChannels) {
      const preferredChannel = toOwnerMessengerChannel(item.owner.preferredNotificationChannel);
      const result = await this.ownerGatewayClient.sendMessage({
        ownerId: item.ownerId,
        channel: requestedChannel,
        preferredChannel,
        subject: item.subject,
        body: item.body,
      });

      if (result.status === 'sent' && result.channel) {
        delivery = {
          ...delivery,
          deliveredMessengerChannels: uniqueChannels([...delivery.deliveredMessengerChannels, result.channel]),
        };
        currentMetadata = writeDeliveryState(currentMetadata, delivery);
        await this.prisma.notificationOutbox.update({
          where: { id: item.id },
          data: { metadata: currentMetadata as Prisma.InputJsonObject },
        });
        continue;
      }

      if (result.status === 'not_linked' && delivery.mode === 'LEGACY_AUTO') {
        await this.complete(item.id);
        return;
      }

      await this.retryOrFail(
        item.id,
        attempt,
        result.status === 'not_linked'
          ? `${requestedChannel === 'AUTO' ? 'Мессенджер' : requestedChannel} больше не подключён у владельца`
          : result.status === 'skipped_not_configured'
            ? 'Отправка в мессенджер пока не настроена'
            : 'Мессенджер не подтвердил отправку',
      );
      return;
    }

    await this.complete(item.id);
  }

  private complete(id: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        lastError: null,
      },
    });
  }

  private async retryOrFail(id: string, attempt: number, error: string) {
    if (attempt >= MAX_DELIVERY_ATTEMPTS) {
      await this.fail(id, error);
      return;
    }

    const delayMinutes = Math.min(5 * 2 ** (attempt - 1), 60);
    await this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        status: NotificationStatus.QUEUED,
        scheduledAt: new Date(Date.now() + delayMinutes * 60_000),
        lastError: `${error}. Повтор через ${delayMinutes} мин.`,
      },
    });
  }

  private fail(id: string, error: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: { status: NotificationStatus.FAILED, lastError: error.slice(0, 500) },
    });
  }

  private async recoverStuckDeliveries() {
    const staleBefore = new Date(Date.now() - STUCK_DELIVERY_MINUTES * 60_000);
    await this.prisma.notificationOutbox.updateMany({
      where: {
        channel: NotificationChannel.MESSENGER,
        status: NotificationStatus.SENDING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: NotificationStatus.QUEUED,
        scheduledAt: new Date(),
        lastError: 'Предыдущая отправка была прервана; задача возвращена в очередь',
      },
    });
  }
}

const notificationDispatchInclude = {
  owner: { select: { id: true, fullName: true, preferredNotificationChannel: true } },
} satisfies Prisma.NotificationOutboxInclude;

type NotificationDispatchItem = Prisma.NotificationOutboxGetPayload<{ include: typeof notificationDispatchInclude }>;

function toOwnerMessengerChannel(channel: NotificationChannel | null): OwnerMessengerChannel | undefined {
  return channel === NotificationChannel.MAX || channel === NotificationChannel.TELEGRAM ? channel : undefined;
}

type DeliveryState = {
  mode: 'EXPLICIT' | 'LEGACY_AUTO';
  messengerChannels: OwnerMessengerChannel[];
  deliveredMessengerChannels: OwnerMessengerChannel[];
  portalDeliveredAt: string | null;
};

function readDeliveryState(metadata: Prisma.JsonValue | null): DeliveryState {
  const root = isJsonObject(metadata) ? metadata : {};
  const value = isJsonObject(root.delivery) ? root.delivery : null;
  const explicit = value?.mode === 'EXPLICIT';

  return {
    mode: explicit ? 'EXPLICIT' : 'LEGACY_AUTO',
    messengerChannels: explicit ? readMessengerChannels(value?.messengerChannels) : [],
    deliveredMessengerChannels: readMessengerChannels(value?.deliveredMessengerChannels),
    portalDeliveredAt: typeof value?.portalDeliveredAt === 'string' ? value.portalDeliveredAt : null,
  };
}

function writeDeliveryState(metadata: unknown, state: DeliveryState): Prisma.InputJsonObject {
  const root = isJsonObject(metadata) ? { ...metadata } : {};
  const previous = isJsonObject(root.delivery) ? root.delivery : {};
  const delivery: Record<string, Prisma.InputJsonValue> = {
    ...previous,
    mode: state.mode,
    messengerChannels: state.messengerChannels,
    deliveredMessengerChannels: state.deliveredMessengerChannels,
  };

  if (state.portalDeliveredAt) {
    delivery.portalDeliveredAt = state.portalDeliveredAt;
  } else {
    delete delivery.portalDeliveredAt;
  }

  return { ...root, delivery } as Prisma.InputJsonObject;
}

function readMessengerChannels(value: unknown): OwnerMessengerChannel[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueChannels(value.filter((channel): channel is OwnerMessengerChannel => channel === 'MAX' || channel === 'TELEGRAM'));
}

function uniqueChannels(channels: OwnerMessengerChannel[]) {
  return [...new Set(channels)];
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getDispatchIntervalMs() {
  const configured = Number(process.env.NOTIFICATION_DISPATCH_INTERVAL_MS);
  if (!Number.isFinite(configured)) {
    return 30_000;
  }
  return Math.min(Math.max(Math.trunc(configured), 5_000), 300_000);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'неизвестная ошибка';
}
