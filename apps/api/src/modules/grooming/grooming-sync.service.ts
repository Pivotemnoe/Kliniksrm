import { HttpException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { GroomingCrmService } from './grooming.service';
import { GroomingBookDto, GroomingCancelDto, GroomingChangeDto, GroomingOptionsDto, GroomingPetDto } from './grooming.dto';
type Operation = { id: string; ownerId: string; kind: string; input: Record<string, unknown>; expiresAt: string };
@Injectable()
export class GroomingSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout; private running = false; private logger = new Logger(GroomingSyncService.name);
  private storefrontPublishedAt = 0;
  constructor(private readonly prisma: PrismaService, private readonly grooming: GroomingCrmService) {}
  onApplicationBootstrap() { if (process.env.GROOMING_CRM_SYNC_ENABLED === 'true') { this.timer = setInterval(() => void this.syncNow(), 3000); this.timer.unref(); void this.syncNow(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async syncNow() {
    if (this.running) return; this.running = true;
    try {
      const registrations = await this.gateway<{ items: Array<{ id: string; maxUserId: string; input: { knownOwnerId?: string; fullName?: string; phone?: string } }> }>('/registrations');
      for (const item of registrations.items) {
        try { const result = await this.grooming.register(item.id, item.maxUserId, item.input); await this.gateway(`/registrations/${item.id}/result`, { result }); }
        catch (error) { if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error; await this.gateway(`/registrations/${item.id}/result`, { error: error.message.slice(0, 300) }); }
      }
      const operations = await this.gateway<{ items: Operation[] }>('/operations');
      for (const item of operations.items) {
        let result: unknown;
        try { result = await this.execute(item); }
        catch (error) {
          if (!(error instanceof HttpException) || error.getStatus() >= 500 || error.getStatus() === 429) throw error;
          await this.gateway(`/operations/${item.id}/result`, { status: 'FAILED', error: error.message.slice(0, 300) }); continue;
        }
        await this.gateway(`/operations/${item.id}/result`, { status: 'DONE', result });
      }
      await this.dispatch();
      if (Date.now() - this.storefrontPublishedAt >= 15000) {
        await this.gateway('/storefront', { payload: await this.grooming.storefrontSnapshot() });
        this.storefrontPublishedAt = Date.now();
      }
    } catch { this.logger.warn('Синхронизация груминга отложена; сохранённые операции будут повторены'); }
    finally { this.running = false; }
  }
  async execute(item: Operation) {
    if (item.kind === 'STATE') return this.grooming.portalState(item.ownerId);
    if (item.kind === 'OPTIONS') return this.grooming.options(item.ownerId, await checked(GroomingOptionsDto, item.input));
    if (item.kind === 'BOOK') return this.grooming.book(item.ownerId, await checked(GroomingBookDto, { ...item.input, clientKey: item.id }));
    const { reservationId, ...input } = item.input;
    if (item.kind === 'RESCHEDULE' && typeof reservationId === 'string') { const dto = await checked(GroomingChangeDto, { ...input, clientKey: item.id }); const { version, ...book } = dto; return this.grooming.book(item.ownerId, book, new Date(), undefined, { id: reservationId, version }); }
    if (item.kind === 'CANCEL' && typeof reservationId === 'string') return this.grooming.status(reservationId, item.ownerId, await checked(GroomingCancelDto, { ...input, clientKey: item.id }));
    if (item.kind === 'PET_CREATE') return this.grooming.createPet(item.ownerId, await checked(GroomingPetDto, { ...item.input, clientKey: item.id }));
    throw new HttpException('Неизвестная операция груминга', 400);
  }
  async dispatch(now = new Date()) {
    const stale = new Date(now.getTime() - 60000);
    // Gateway delivery IDs make transport retries safe; never invent a fresh ID.
    await this.prisma.groomingNotification.updateMany({ where: { status: 'SENDING', attemptedAt: { lt: stale } }, data: { status: 'QUEUED', lastError: 'Проверяется прежняя отправка' } });
    const items = await this.prisma.groomingNotification.findMany({ where: { status: 'QUEUED', scheduledAt: { lte: now } }, include: { reservation: true }, take: 50, orderBy: { scheduledAt: 'asc' } });
    for (const item of items) {
      if (item.expiresAt <= now || item.reservation.version !== item.reservationVersion || (item.event === 'REMINDER' && item.reservation.status !== 'CONFIRMED')) {
        await this.prisma.groomingNotification.updateMany({ where: { id: item.id, status: 'QUEUED' }, data: { status: 'CANCELLED', lastError: 'Запись изменилась или срок истёк' } }); continue;
      }
      if (item.recipientKind === 'STAFF') {
        const assigned = await this.prisma.groomingSpecialist.findUnique({ where: { employeeId: item.reservation.employeeId } });
        const settings = await this.prisma.groomingSettings.findUnique({ where: { installationId: item.reservation.installationId } });
        const currentGroomer = assigned?.maxUserId === item.recipientId;
        if (!currentGroomer && (item.event === 'REMINDER' || !settings?.administratorMaxIds.includes(item.recipientId))) {
          await this.prisma.groomingNotification.updateMany({ where: { id: item.id, status: 'QUEUED' }, data: { status: 'CANCELLED', lastError: 'Получатель больше не назначен' } }); continue;
        }
      }
      const claimed = await this.prisma.groomingNotification.updateMany({ where: { id: item.id, status: 'QUEUED' }, data: { status: 'SENDING', attemptedAt: now, attempts: { increment: 1 } } });
      if (!claimed.count) continue;
      try {
        const result = await this.gateway<{ status: string; retryAt?: string }>(`/deliveries/${item.id}`, { recipientKind: item.recipientKind, recipientId: item.recipientId, kind: item.event === 'REMINDER' ? 'GROOMING_REMINDER' : 'GROOMING_CHANGE', text: item.text, expiresAt: item.expiresAt.toISOString() });
        const deferred = ['DEFERRED', 'DISABLED', 'SENDING'].includes(result.status);
        const retryAt = new Date(result.retryAt || now.getTime() + 60000);
        await this.prisma.groomingNotification.updateMany({ where: { id: item.id, status: 'SENDING' }, data: { status: result.status === 'SENT' ? 'SENT' : deferred && retryAt < item.expiresAt ? 'QUEUED' : ['NO_CONSENT', 'EXPIRED', 'CANCELLED'].includes(result.status) ? 'CANCELLED' : result.status === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED', scheduledAt: deferred ? retryAt : item.scheduledAt, sentAt: result.status === 'SENT' ? now : null, lastError: result.status === 'SENT' ? null : result.status } });
      } catch { await this.prisma.groomingNotification.updateMany({ where: { id: item.id, status: 'SENDING' }, data: { status: item.attempts >= 4 ? 'FAILED' : 'QUEUED', scheduledAt: new Date(now.getTime() + 60000), lastError: 'Шлюз недоступен; доставка будет проверена с тем же ID' } }); }
    }
  }
  private async gateway<T = unknown>(path: string, body?: unknown): Promise<T> {
    const base = process.env.OWNER_GATEWAY_URL?.trim().replace(/\/+$/, ''), secret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();
    if (!base || !secret || secret.length < 24) throw new Error('Gateway unavailable');
    const response = await fetch(`${base}/internal/v1/grooming/portal${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-owner-gateway-secret': secret, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (!response.ok) throw new Error('Gateway unavailable'); return response.json() as Promise<T>;
  }
}
async function checked<T extends object>(type: new () => T, input: unknown): Promise<T> { const dto = plainToInstance(type, input); const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true }); if (errors.length) throw new HttpException('Проверьте поля записи', 400); return dto; }
