import { HttpException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveUpdatesService } from '../live-updates/live-updates.service';
import { HotelOperation, PetHotelOwnerService } from './pet-hotel-portal.service';

@Injectable()
export class PetHotelSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private storefrontPublishedAt = 0;
  private logger = new Logger(PetHotelSyncService.name);
  constructor(private readonly prisma: PrismaService, private readonly owner: PetHotelOwnerService, private readonly live: LiveUpdatesService) {}
  onApplicationBootstrap() {
    if (process.env.PET_HOTEL_CRM_SYNC_ENABLED === 'true') { this.timer = setInterval(() => void this.syncNow(), 3000); this.timer.unref(); void this.syncNow(); }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async syncNow() {
    if (this.running) return;
    this.running = true;
    try {
      await this.syncStep('каталог', async () => {
        if (Date.now() - this.storefrontPublishedAt >= 15000) { await this.gateway('/storefront', { payload: await this.owner.storefrontSnapshot() }); this.storefrontPublishedAt = Date.now(); }
      });
      await this.syncStep('вход в кабинет', async () => {
        const registrations = await this.gateway<{ items: Array<{ id: string; maxUserId: string; input: { knownOwnerId?: string; fullName?: string; phone?: string } }> }>('/registrations');
        for (const item of registrations.items) {
          try { await this.gateway(`/registrations/${item.id}/result`, { result: await this.owner.register(item.id, item.maxUserId, item.input) }); }
          catch (error) { if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error; await this.gateway(`/registrations/${item.id}/result`, { error: error.message.slice(0, 300) }); }
        }
      });
      await this.syncStep('запросы кабинета', async () => {
        const operations = await this.gateway<{ items: HotelOperation[] }>('/operations');
        for (const item of operations.items) {
          let result: unknown;
          try { result = await this.owner.execute(item); }
          catch (error) {
            if (!(error instanceof HttpException) || error.getStatus() >= 500 || error.getStatus() === 429) throw error;
            await this.gateway(`/operations/${item.id}/result`, { status: 'FAILED', error: error.message.slice(0, 300) }); continue;
          }
          await this.gateway(`/operations/${item.id}/result`, { status: 'DONE', result });
          if (!['STATE', 'OPTIONS'].includes(item.kind)) this.live.publish('pet-hotel', null);
        }
      });
      await this.syncStep('оповещения', () => this.dispatch());
    }
    finally { this.running = false; }
  }
  private async syncStep(stage: string, task: () => Promise<void>) {
    try { await task(); }
    catch { this.logger.warn(`Синхронизация зоогостиницы отложена; сохранённые команды будут повторены (${stage})`); }
  }
  async dispatch(now = new Date()) {
    await this.prisma.petHotelNotification.updateMany({ where: { status: 'SENDING', attemptedAt: { lt: new Date(+now - 60000) } }, data: { status: 'QUEUED', lastError: 'Проверяется прежняя отправка' } });
    const items = await this.prisma.petHotelNotification.findMany({ where: { status: 'QUEUED', scheduledAt: { lte: now } }, include: { reservation: { include: { installation: { include: { petHotelSettings: true } } } } }, take: 50, orderBy: { scheduledAt: 'asc' } });
    for (const item of items) {
      const settings = item.reservation.installation.petHotelSettings;
      if (item.expiresAt <= now || item.reservation.version !== item.reservationVersion || (item.event === 'REMINDER' && (item.reservation.status !== 'RESERVED' || !item.reservation.installation.enabled)) || (item.recipientKind === 'STAFF' && !settings?.administratorMaxIds.includes(item.recipientId))) {
        await this.prisma.petHotelNotification.updateMany({ where: { id: item.id, status: 'QUEUED' }, data: { status: 'CANCELLED', lastError: 'Бронь, получатель или срок изменились' } }); continue;
      }
      if (!(await this.prisma.petHotelNotification.updateMany({ where: { id: item.id, status: 'QUEUED' }, data: { status: 'SENDING', attemptedAt: now, attempts: { increment: 1 } } })).count) continue;
      try {
        const result = await this.gateway<{ status: string; retryAt?: string }>(`/deliveries/${item.id}`, { recipientKind: item.recipientKind, recipientId: item.recipientId, kind: item.event === 'REMINDER' ? 'PET_HOTEL_REMINDER' : 'PET_HOTEL_CHANGE', text: item.text, expiresAt: item.expiresAt.toISOString() });
        const deferred = ['DEFERRED', 'DISABLED', 'SENDING'].includes(result.status);
        let retryAt = new Date(result.retryAt || +now + 60000); if (!Number.isFinite(+retryAt)) retryAt = new Date(+now + 60000);
        await this.prisma.petHotelNotification.updateMany({ where: { id: item.id, status: 'SENDING' }, data: { status: result.status === 'SENT' ? 'SENT' : deferred && retryAt < item.expiresAt ? 'QUEUED' : ['NO_CONSENT', 'EXPIRED', 'CANCELLED'].includes(result.status) ? 'CANCELLED' : result.status === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED', scheduledAt: deferred ? retryAt : item.scheduledAt, sentAt: result.status === 'SENT' ? now : null, lastError: result.status === 'SENT' ? null : result.status } });
      } catch { await this.prisma.petHotelNotification.updateMany({ where: { id: item.id, status: 'SENDING' }, data: { status: item.attempts >= 4 ? 'FAILED' : 'QUEUED', scheduledAt: new Date(+now + 60000), lastError: 'Шлюз недоступен; повтор с тем же ID доставки' } }); }
    }
  }
  private async gateway<T = unknown>(path: string, body?: unknown): Promise<T> {
    const base = process.env.OWNER_GATEWAY_URL?.trim().replace(/\/+$/, ''), secret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();
    if (!base || !secret || secret.length < 24) throw new Error('Gateway unavailable');
    const response = await fetch(`${base}/internal/v1/pet-hotel/portal${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-owner-gateway-secret': secret, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (!response.ok) throw new Error('Gateway unavailable');
    return response.json() as Promise<T>;
  }
}
