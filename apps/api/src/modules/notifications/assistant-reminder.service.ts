import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { selectCurrentVaccinations } from '../animals/vaccination-due';

type Kind = 'APPOINTMENT_CHANGE' | 'APPOINTMENT_REMINDER' | 'REVISIT' | 'VACCINATION';
type Subscriber = { ownerId: string; appointmentChanges: boolean; appointmentReminders: boolean; revisitReminders: boolean; vaccinationReminders: boolean };
type Reminder = { kind: Kind; referenceId: string; fingerprint: string; expiresAt: string; text: string };
@Injectable()
export class AssistantReminderService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(AssistantReminderService.name);
  constructor(private readonly prisma: PrismaService) {}
  enabled() { return process.env.CLINIC_ASSISTANT_REMINDERS_ENABLED === 'true'; }
  onApplicationBootstrap() { if (this.enabled()) { this.timer = setInterval(() => void this.syncNow(), 30000); this.timer.unref(); void this.syncNow(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async syncNow(now = new Date()) {
    if (!this.enabled() || this.running) return;
    this.running = true;
    try { for (const subscriber of await this.gateway<Subscriber[]>('/subscribers')) await this.observeOwner(subscriber, now); }
    catch { this.logger.warn('Напоминания сохранены; шлюз временно недоступен'); }
    finally { this.running = false; }
  }
  private async observeOwner(subscriber: Subscriber, now: Date) {
    const access = await this.prisma.clientPortalAccess.findFirst({ where: { ownerId: subscriber.ownerId, status: { in: ['ENABLED', 'INVITED'] } } });
    if (!access) return;
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, 1)`;
      const tracked = await tx.assistantReminderSource.findMany({ where: { ownerId: subscriber.ownerId }, select: { id: true } });
      const appointments = await tx.appointment.findMany({ where: { ownerId: subscriber.ownerId, OR: [{ startsAt: { gte: now, lte: new Date(now.getTime() + 31 * 86400000) } }, { id: { in: tracked.map(x => x.id.replace('appointment:', '')) } }] }, include: { office: { select: { timezone: true } } } });
      for (const appointment of appointments) {
        const id = `appointment:${appointment.id}`, fingerprint = appointmentFingerprint(appointment);
        const existing = await tx.assistantReminderSource.findUnique({ where: { id } });
        const changed = existing?.fingerprint !== fingerprint;
        const source = await tx.assistantReminderSource.upsert({ where: { id }, create: { id, ownerId: appointment.ownerId, fingerprint, observedAt: now }, update: changed ? { fingerprint, ownerId: appointment.ownerId, revision: { increment: 1 }, observedAt: now } : {} });
        if (changed) await cancelAppointmentReminders(tx, appointment.id);
        const date = formatDateTime(appointment.startsAt, appointment.office?.timezone || 'Europe/Moscow');
        const future = appointment.startsAt > now && appointment.status === 'PLANNED';
        // First observation baselines older records instead of sending historical confirmations.
        if (subscriber.appointmentChanges && changed && (existing || appointment.createdAt.getTime() >= now.getTime() - 86400000) && (future || (existing && appointment.status === 'CANCELLED'))) {
          const text = appointment.status === 'CANCELLED' ? 'TemichevVet: запись на приём отменена. Подробности доступны в личном кабинете.' : existing ? `TemichevVet: запись на приём изменена. Новое время: ${date}. Подробности в личном кабинете.` : `TemichevVet: запись на приём подтверждена: ${date}. Подробности в личном кабинете.`;
          await this.queue(tx, appointment.ownerId, appointment.animalId, `assistant-appointment:${appointment.id}:${source.revision}:change`, now, { kind: 'APPOINTMENT_CHANGE', referenceId: appointment.id, fingerprint, expiresAt: new Date(appointment.status === 'CANCELLED' ? now.getTime() + 86400000 : Math.min(now.getTime() + 86400000, appointment.startsAt.getTime())).toISOString(), text });
        }
        if (subscriber.appointmentReminders && future) {
          await this.queue(tx, appointment.ownerId, appointment.animalId, `assistant-appointment:${appointment.id}:${source.revision}:reminder`, new Date(Math.max(now.getTime(), appointment.startsAt.getTime() - 86400000)), { kind: 'APPOINTMENT_REMINDER', referenceId: appointment.id, fingerprint, expiresAt: appointment.startsAt.toISOString(), text: `TemichevVet: напоминаем о записи на приём: ${date}. Подробности в личном кабинете.` });
        }
      }
      if (subscriber.revisitReminders) {
        const tasks = await tx.task.findMany({ where: { ownerId: subscriber.ownerId, taskType: 'revisit', status: 'OPEN', dueAt: { gt: now, lte: new Date(now.getTime() + 8 * 86400000) } } });
        for (const task of tasks) {
          if (!task.dueAt) continue;
          const fingerprint = taskFingerprint(task);
          const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'long' }).format(task.dueAt);
          await this.queue(tx, subscriber.ownerId, task.animalId, `assistant-revisit:${task.id}:${fingerprint}`, new Date(Math.max(now.getTime(), task.dueAt.getTime() - 86400000)), { kind: 'REVISIT', referenceId: task.id, fingerprint, expiresAt: task.dueAt.toISOString(), text: `TemichevVet: напоминание о повторном визите ${date}. Это ещё не запись на приём. Свяжитесь с клиникой, чтобы выбрать время.` });
        }
      }
    }, { timeout: 15000 });
  }
  private queue(tx: Prisma.TransactionClient, ownerId: string, animalId: string | null, dedupeKey: string, scheduledAt: Date, reminder: Reminder) {
    return tx.notificationOutbox.upsert({ where: { dedupeKey }, create: { ownerId, animalId, channel: NotificationChannel.MESSENGER, recipient: `owner:${ownerId}`, body: reminder.text, subject: 'Сообщение клиники', scheduledAt, dedupeKey, metadata: { source: 'assistant-reminder', reminder: { ...reminder } } }, update: {} });
  }
  handles(metadata: unknown) { const root = object(metadata); return this.enabled() && (root.source === 'assistant-reminder' || root.source === 'vaccination'); }
  async dispatch(id: string, now = new Date()) {
    const claimed = await this.prisma.notificationOutbox.updateMany({ where: { id, status: 'QUEUED', scheduledAt: { lte: now } }, data: { status: 'SENDING', attempts: { increment: 1 }, lastError: null } });
    if (!claimed.count) return;
    const item = await this.prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });
    try {
      if (item.attempts > 1) {
        const prior = await this.gateway<{ status: string }>(`/${encodeURIComponent(id)}/result`);
        if (prior.status === 'SENT') { await this.prisma.notificationOutbox.updateMany({ where: { id, status: 'SENDING' }, data: { status: 'SENT', sentAt: now, lastError: null } }); return; }
        if (['UNKNOWN', 'REJECTED'].includes(prior.status)) { await this.finish(id, 'FAILED', prior.status === 'UNKNOWN' ? 'Нет подтверждения доставки. Автоматический повтор запрещён' : 'MAX отклонил сообщение. Требуется другой способ связи', prior.status === 'UNKNOWN'); return; }
        if (prior.status === 'SENDING') { await this.defer(id, now, 'Проверяется прежняя отправка'); return; }
      }
      const reminder = await this.validate(item, now);
      if (!reminder || !item.ownerId) { await this.finish(id, 'CANCELLED', 'Дата или источник напоминания больше не актуальны'); return; }
      const result = await this.gateway<{ status: string; retryAt?: string }>(`/${encodeURIComponent(id)}/deliver`, { ownerId: item.ownerId, kind: reminder.kind, text: reminder.text, expiresAt: reminder.expiresAt });
      if (result.status === 'SENT') { await this.prisma.notificationOutbox.updateMany({ where: { id, status: 'SENDING' }, data: { status: 'SENT', sentAt: now, lastError: null } }); return; }
      if (['DEFERRED', 'SENDING', 'DISABLED'].includes(result.status)) {
        const retryAt = result.retryAt ? new Date(result.retryAt) : new Date(now.getTime() + 60000);
        if (retryAt >= new Date(reminder.expiresAt)) { await this.finish(id, 'CANCELLED', 'Напоминание не отправлено до назначенного времени'); return; }
        await this.prisma.notificationOutbox.updateMany({ where: { id, status: 'SENDING' }, data: { status: 'QUEUED', scheduledAt: retryAt, lastError: result.status === 'DEFERRED' ? 'Отправка отложена: тихие часы или дневной лимит' : 'Ожидается состояние доставки' } }); return;
      }
      if (['NO_CONSENT', 'EXPIRED', 'CANCELLED'].includes(result.status)) { await this.finish(id, 'CANCELLED', 'Согласие отключено или срок напоминания истёк'); return; }
      await this.finish(id, 'FAILED', result.status === 'NOT_LINKED' ? 'MAX не подключён. Администратору нужно связаться другим способом' : result.status === 'REJECTED' ? 'MAX отклонил сообщение. Администратору нужно связаться другим способом' : 'Нет подтверждения доставки. Автоматический повтор запрещён', result.status === 'UNKNOWN');
    } catch {
      // Same gateway ID can only query/replay an existing delivery, never make a second send.
      if (item.attempts >= 5) await this.finish(id, 'FAILED', 'Шлюз недоступен после пяти попыток. Требуется проверить доставку и связаться другим способом');
      else await this.defer(id, now, 'Шлюз недоступен; результат будет проверен с тем же ключом');
    }
  }
  private defer(id: string, now: Date, error: string) { return this.prisma.notificationOutbox.updateMany({ where: { id, status: 'SENDING' }, data: { status: 'QUEUED', scheduledAt: new Date(now.getTime() + 60000), lastError: error } }); }
  private async validate(item: { ownerId: string | null; animalId: string | null; metadata: Prisma.JsonValue | null }, now: Date): Promise<Reminder | null> {
    if (!item.ownerId || !await this.prisma.clientPortalAccess.findFirst({ where: { ownerId: item.ownerId, status: { in: ['ENABLED', 'INVITED'] } } })) return null;
    const root = object(item.metadata);
    if (root.source === 'vaccination') {
      if (typeof root.vaccinationId !== 'string') return null;
      const vaccination = await this.prisma.vaccination.findUnique({ where: { id: root.vaccinationId }, include: { animal: { select: { id: true, ownerId: true, archivedAt: true } }, revaccinationTask: { select: { status: true } } } });
      if (!vaccination || vaccination.cancelledAt || vaccination.animal.archivedAt || vaccination.animal.ownerId !== item.ownerId || !vaccination.ownerReminderEnabled || !vaccination.expiresAt || (vaccination.revaccinationTask && vaccination.revaccinationTask.status !== 'OPEN') || vaccination.expiresAt.toISOString().slice(0, 10) !== root.dueDate) return null;
      const doses = await this.prisma.vaccination.findMany({ where: { animalId: vaccination.animalId, cancelledAt: null }, include: { animal: { select: { id: true } } } });
      if (!selectCurrentVaccinations(doses).some(x => x.id === vaccination.id)) return null;
      const expiresAt = new Date(vaccination.expiresAt.getTime() + 86400000).toISOString();
      return new Date(expiresAt) > now ? { kind: 'VACCINATION', referenceId: vaccination.id, fingerprint: vaccination.expiresAt.toISOString(), expiresAt, text: 'TemichevVet: в личном кабинете есть напоминание о вакцинации по дате, указанной клиникой. Свяжитесь с клиникой, чтобы выбрать время.' } : null;
    }
    const value = object(root.reminder);
    if (typeof value.referenceId !== 'string' || typeof value.fingerprint !== 'string' || typeof value.expiresAt !== 'string' || typeof value.text !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)) || new Date(value.expiresAt) <= now) return null;
    if (value.kind === 'APPOINTMENT_CHANGE' || value.kind === 'APPOINTMENT_REMINDER') {
      const appointment = await this.prisma.appointment.findUnique({ where: { id: value.referenceId } });
      if (!appointment || appointment.ownerId !== item.ownerId || appointment.animalId !== item.animalId || appointmentFingerprint(appointment) !== value.fingerprint || (value.kind === 'APPOINTMENT_REMINDER' && (appointment.status !== 'PLANNED' || appointment.startsAt <= now))) return null;
    } else if (value.kind === 'REVISIT') {
      const task = await this.prisma.task.findUnique({ where: { id: value.referenceId } });
      if (!task || task.ownerId !== item.ownerId || task.animalId !== item.animalId || task.taskType !== 'revisit' || task.status !== 'OPEN' || !task.dueAt || task.dueAt <= now || taskFingerprint(task) !== value.fingerprint) return null;
    } else return null;
    return value as unknown as Reminder;
  }
  private async finish(id: string, status: NotificationStatus, error: string, unknown = false) {
    const item = await this.prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });
    return this.prisma.notificationOutbox.updateMany({ where: { id, status: 'SENDING' }, data: { status, lastError: error, ...(unknown ? { metadata: { ...object(item.metadata), deliveryUnknown: true } as Prisma.InputJsonObject } : {}) } });
  }
  private async gateway<T>(path: string, body?: unknown): Promise<T> {
    const base = process.env.OWNER_GATEWAY_URL?.trim().replace(/\/+$/, ''), secret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();
    if (!base || !secret || secret.length < 16) throw new Error('Gateway unavailable');
    const response = await fetch(`${base}/internal/v1/assistant/notifications${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-owner-gateway-secret': secret, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000), redirect: 'manual' });
    if (!response.ok) throw new Error('Gateway unavailable');
    return response.json() as Promise<T>;
  }
}
export function cancelAppointmentReminders(tx: Prisma.TransactionClient, appointmentId: string) {
  return tx.notificationOutbox.updateMany({ where: { dedupeKey: { startsWith: `assistant-appointment:${appointmentId}:` }, status: { in: ['QUEUED', 'FAILED'] } }, data: { status: 'CANCELLED', lastError: 'Запись изменилась; прежнее уведомление аннулировано' } });
}
function appointmentFingerprint(item: { ownerId: string; animalId: string; officeId: string | null; employeeId: string | null; roomId: string | null; startsAt: Date; endsAt: Date | null; status: string }) { return digest([item.ownerId, item.animalId, item.officeId, item.employeeId, item.roomId, item.startsAt.toISOString(), item.endsAt?.toISOString(), item.status]); }
function taskFingerprint(item: { ownerId: string | null; animalId: string | null; dueAt: Date | null; taskType: string | null; status: string }) { return digest([item.ownerId, item.animalId, item.dueAt?.toISOString(), item.taskType, item.status]); }
function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function formatDateTime(date: Date, timezone: string) { return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date); }
