import { BadRequestException, ConflictException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { lockOnlineRequest } from './online-request-attention.service';

type Conversation = {
  id: string; sequence: number; bookingSequence?: number; source: string; mode: string; ownerId: string | null;
  contactName: string | null; phone: string | null; animalNickname: string | null;
  preferredAt: string | null; contactConsent: boolean; needsAttention: boolean; maxUserId: string | null;
  messages: { id: string; sequence: number; bookingSequence?: number; author: string; channel: string; text: string; deliveryStatus: string; createdAt: string }[];
};
@Injectable()
export class ClinicConversationSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout; private running = false;
  private readonly logger = new Logger(ClinicConversationSyncService.name);
  constructor(private readonly prisma: PrismaService) {}
  onApplicationBootstrap() {
    if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true') return;
    this.timer = setInterval(() => void this.syncNow(), 10_000); this.timer.unref(); void this.syncNow();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async syncNow() {
    if (this.running) return { status: 'running' };
    if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true') return { status: 'disabled' };
    this.running = true;
    try {
      await this.flush();
      const result = await this.gateway<{ items: Conversation[] }>('/pending');
      for (const item of result.items) {
        const request = await this.importConversation(item);
        await this.gateway(`/${encodeURIComponent(item.id)}/ack`, { sequence: item.sequence, crmRequestId: request.id });
      }
      return { status: 'synced', count: result.items.length };
    } catch { this.logger.warn('Переписка пока не синхронизирована; очередь сохранена'); return { status: 'unavailable' }; }
    finally { this.running = false; }
  }
  async importConversation(item: Conversation) {
    if (!item.id || !Number.isSafeInteger(item.sequence) || !Array.isArray(item.messages)) throw new BadRequestException('Некорректная версия переписки');
    return this.prisma.$transaction(async tx => {
      // Also arbitrates first import from multiple CRM API workers.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, 3)`;
      const latest = await tx.onlineAppointmentRequest.findFirst({ where: { conversationId: item.id }, orderBy: { createdAt: 'desc' } });
      const newBooking = latest && ['ACCEPTED', 'CANCELLED', 'ARCHIVED'].includes(latest.status) && Number(item.bookingSequence || 0) > Math.max(latest.conversationVersion, latest.assistantBookingSequence || 0);
      const existing = newBooking ? null : latest;
      if (existing && existing.conversationVersion >= item.sequence) return existing;
      const owner = item.ownerId ? await tx.owner.findUnique({ where: { id: item.ownerId }, select: { id: true, fullName: true, phone: true } }) : null;
      const inbound = item.messages.filter(x => x.author === 'OWNER');
      const newInbound = inbound.some(x => x.sequence > (existing?.conversationVersion ?? 0));
      const deliveryFailure = item.messages.some(x => ['FAILED', 'UNKNOWN'].includes(x.deliveryStatus));
      const needsAttention = item.needsAttention && (newInbound || deliveryFailure);
      const data = {
        conversationVersion: item.sequence, conversationSnapshot: JSON.parse(JSON.stringify(item)) as Prisma.InputJsonValue,
        conversationNeedsAttention: needsAttention,
        ...(!existing || !existing.ownerId ? { ownerId: owner?.id ?? null } : {}),
        // An unverified phone never links an existing owner's record.
        ...(item.contactConsent ? { ownerName: item.contactName || owner?.fullName || 'Посетитель чата', phone: item.phone || owner?.phone || 'чат', animalNickname: item.animalNickname || 'Не указан', ...(!existing?.appointmentId ? { preferredAt: item.preferredAt ? new Date(item.preferredAt) : null } : {}) } : {}),
        ...(!existing ? { comment: inbound.at(-1)?.text?.slice(0, 1000) || 'Новое обращение в чате' } : {}),
      };
      const row = existing
        ? await tx.onlineAppointmentRequest.update({ where: { id: existing.id }, data })
        : await tx.onlineAppointmentRequest.create({ data: { ownerName: owner?.fullName || item.contactName || 'Посетитель чата', phone: owner?.phone || item.phone || 'чат', animalNickname: item.animalNickname || 'Не указан', source: item.source, externalRequestId: `assistant:${item.id}:${item.bookingSequence || 0}`, conversationId: item.id, ...data } });
      await tx.auditLog.create({ data: { action: 'clinic_conversation.sync', entityType: 'OnlineAppointmentRequest', entityId: row.id, metadata: { version: item.sequence } } });
      return row;
    });
  }
  async enqueue(requestId: string, actorId: string, input: { clientKey: string; action: 'REPLY' | 'RESUME' | 'RESOLVE'; text?: string }) {
    if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true') throw new ServiceUnavailableException('Чат пока не включён');
    return this.prisma.$transaction(async tx => {
      await lockOnlineRequest(tx, requestId);
      const request = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (!request.conversationId) throw new BadRequestException('У заявки нет переписки');
      if (request.assignedEmployeeId !== actorId) throw new ConflictException('Сначала возьмите обращение в работу');
      if (input.action === 'REPLY' && !input.text?.trim()) throw new BadRequestException('Введите ответ');
      const existing = await tx.backgroundJob.findFirst({ where: { queueName: 'clinic-conversation', payload: { path: ['clientKey'], equals: input.clientKey } } });
      if (existing) {
        const payload = existing.payload as Prisma.JsonObject;
        if (payload.requestId !== requestId || payload.actorId !== actorId) throw new ConflictException('Ключ ответа уже использован');
        return existing;
      }
      const job = await tx.backgroundJob.create({ data: { queueName: 'clinic-conversation', jobName: 'command', payload: { ...input, text: input.text?.trim() || null, requestId, conversationId: request.conversationId, actorId, attempts: 0 } } });
      const snapshot = request.conversationSnapshot as Prisma.JsonObject | null;
      const closesRequest = input.action === 'RESOLVE' || (input.action === 'RESUME' && !snapshot?.bookingSequence);
      await tx.onlineAppointmentRequest.update({ where: { id: requestId }, data: {
        conversationNeedsAttention: false,
        ...(closesRequest && ['NEW', 'IN_REVIEW'].includes(request.status) ? { status: 'ARCHIVED' } : {}),
      } });
      await tx.auditLog.create({ data: { actorId, action: `clinic_conversation.${input.action.toLowerCase()}`, entityType: 'OnlineAppointmentRequest', entityId: requestId, metadata: { jobId: job.id } } });
      return job;
    });
  }
  async queueConfirmation(tx: Prisma.TransactionClient, request: { id: string; conversationId: string | null; assistantBookingKey?: string | null }, appointment: { id: string; startsAt: Date; office?: { timezone: string } | null }) {
    if (!request.conversationId) return;
    const timezone = appointment.office?.timezone || 'Europe/Moscow';
    const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: timezone }).format(appointment.startsAt);
    const timeLabel = timezone === 'Europe/Moscow' ? 'московское время' : `время филиала, ${timezone}`;
    await tx.backgroundJob.create({ data: { queueName: 'clinic-conversation', jobName: 'command', payload: {
      requestId: request.id, conversationId: request.conversationId, clientKey: `confirmation_${appointment.id}`, action: 'CONFIRM', appointmentId: appointment.id,
      returnToAssistant: Boolean(request.assistantBookingKey),
      text: `Запись подтверждена: ${date} (${timeLabel}).`, attempts: 0,
    } } });
  }
  async jobs(requestId: string) {
    return this.prisma.backgroundJob.findMany({ where: { queueName: 'clinic-conversation', payload: { path: ['requestId'], equals: requestId } }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, status: true, payload: true, createdAt: true, error: true } });
  }
  async retry(requestId: string, jobId: string, actorId: string) {
    if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true') throw new ServiceUnavailableException('Чат пока не включён');
    return this.prisma.$transaction(async tx => {
      await lockOnlineRequest(tx, requestId);
      const request = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (request.assignedEmployeeId !== actorId) throw new ConflictException('Сначала возьмите обращение в работу');
      const job = await tx.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });
      const payload = job.payload as Prisma.JsonObject;
      if (job.queueName !== 'clinic-conversation' || payload.requestId !== requestId) throw new BadRequestException('Ответ не относится к обращению');
      if (job.status !== 'FAILED') return job;
      const updated = await tx.backgroundJob.update({ where: { id: jobId }, data: { status: 'PENDING', error: null, payload: { ...payload, nextAttemptAt: new Date(0).toISOString() } } });
      await tx.auditLog.create({ data: { actorId, action: 'clinic_conversation.retry', entityType: 'OnlineAppointmentRequest', entityId: requestId, metadata: { jobId } } });
      return updated;
    });
  }
  private async flush() {
    const jobs = await this.prisma.backgroundJob.findMany({ where: { queueName: 'clinic-conversation', status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 30 });
    for (const job of jobs) {
      const payload = job.payload as Prisma.JsonObject;
      if (typeof payload.nextAttemptAt === 'string' && new Date(payload.nextAttemptAt) > new Date()) continue;
      try {
        await this.gateway(`/${encodeURIComponent(String(payload.conversationId))}/commands`, { clientKey: payload.clientKey, action: payload.action, text: payload.text || undefined, appointmentId: payload.appointmentId || undefined, returnToAssistant: payload.returnToAssistant || undefined, crmRequestId: payload.requestId });
        await this.prisma.backgroundJob.update({ where: { id: job.id }, data: { status: 'DONE', error: null } });
      } catch (error) {
        const attempts = Number(payload.attempts || 0) + 1;
        const terminal = error instanceof GatewayRejection;
        await this.prisma.backgroundJob.update({ where: { id: job.id }, data: { status: terminal ? 'FAILED' : 'PENDING', error: terminal ? 'Требуется проверка доставки администратором' : 'Нет связи со шлюзом чата', payload: { ...payload, attempts, nextAttemptAt: new Date(Date.now() + Math.min(300_000, 10_000 * 2 ** Math.min(attempts, 5))).toISOString() } } });
        if (terminal && typeof payload.requestId === 'string') await this.prisma.onlineAppointmentRequest.update({ where: { id: payload.requestId }, data: { conversationNeedsAttention: true } });
        break;
      }
    }
  }
  private async gateway<T = unknown>(path: string, body?: unknown): Promise<T> {
    const base = process.env.OWNER_GATEWAY_URL?.trim().replace(/\/+$/, ''); const secret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();
    if (!base || !secret) throw new ServiceUnavailableException('Шлюз чата не настроен');
    const response = await fetch(`${base}/internal/v1/assistant${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-owner-gateway-secret': secret, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { if (response.status >= 400 && response.status < 500 && response.status !== 429) throw new GatewayRejection(); throw new Error('Gateway unavailable'); }
    return response.json() as Promise<T>;
  }
}
class GatewayRejection extends Error {}
