import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { MaxBotClient } from './max-bot.client';
import { hashToken } from './security';
import { DeliverOwnerNotificationDto, OwnerNotificationKind, OwnerNotificationPreferenceDto } from './dto/owner-notification.dto';
import { nextNotificationTime, notificationLocalTime } from './owner-notification-policy';

const fieldForKind = { APPOINTMENT_CHANGE: 'appointmentChanges', APPOINTMENT_REMINDER: 'appointmentReminders', REVISIT: 'revisitReminders', VACCINATION: 'vaccinationReminders' } as const;
@Injectable()
export class OwnerNotificationService {
  constructor(private readonly prisma: PrismaService, private readonly max: MaxBotClient) {}
  private async session(token?: string) {
    if (!token) throw new ForbiddenException('Войдите в личный кабинет');
    const session = await this.prisma.portalSession.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ForbiddenException('Войдите в личный кабинет');
    return session;
  }
  async read(token?: string) {
    const session = await this.session(token);
    const preference = await this.prisma.ownerNotificationPreference.upsert({ where: { ownerId: session.ownerId }, create: { ownerId: session.ownerId }, update: {} });
    const linked = await this.prisma.messengerBinding.findUnique({ where: { ownerId_channel: { ownerId: session.ownerId, channel: 'MAX' } } });
    return { preference, maxLinked: Boolean(linked) };
  }
  async save(token: string | undefined, dto: OwnerNotificationPreferenceDto) {
    const session = await this.session(token);
    try { notificationLocalTime(new Date(), dto.timezone); } catch { throw new BadRequestException('Выберите корректный часовой пояс'); }
    if (dto.channel !== 'MAX') throw new BadRequestException('На этом этапе доступны уведомления MAX');
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, hashtext(${session.ownerId}))`;
      // Recheck revocation inside the write transaction.
      const active = await tx.portalSession.findFirst({ where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (!active) throw new ForbiddenException('Войдите в личный кабинет');
      await tx.ownerNotificationPreference.upsert({ where: { ownerId: session.ownerId }, create: { ownerId: session.ownerId, ...dto, consentAt: dto.enabled ? new Date() : null }, update: { ...dto, version: { increment: 1 }, consentAt: dto.enabled ? new Date() : null } });
    });
    return this.read(token);
  }
  async unsubscribe(token?: string) {
    const session = await this.session(token); await this.stopOwner(session.ownerId); return this.read(token);
  }
  async unsubscribeByMax(externalUserId: string) {
    const binding = await this.prisma.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId } } });
    if (binding) await this.stopOwner(binding.ownerId);
    return Boolean(binding);
  }
  private async stopOwner(ownerId: string) {
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, hashtext(${ownerId}))`;
      const stopped = { enabled: false, appointmentChanges: false, appointmentReminders: false, revisitReminders: false, vaccinationReminders: false, consentAt: null };
      await tx.ownerNotificationPreference.upsert({ where: { ownerId }, create: { ownerId, ...stopped }, update: { ...stopped, version: { increment: 1 } } });
    });
  }
  async subscribers() {
    const owners = await this.prisma.ownerSnapshot.findMany({ select: { ownerId: true, notificationPreference: true, bindings: { where: { channel: 'MAX' }, select: { id: true } } } });
    return owners.filter(x => x.bindings.length && (x.notificationPreference?.enabled ?? true)).map(x => ({ ownerId: x.ownerId, appointmentChanges: x.notificationPreference?.appointmentChanges ?? true, appointmentReminders: x.notificationPreference?.appointmentReminders ?? true, revisitReminders: x.notificationPreference?.revisitReminders ?? true, vaccinationReminders: x.notificationPreference?.vaccinationReminders ?? true }));
  }
  async deliver(id: string, input: DeliverOwnerNotificationDto, now = new Date()) {
    if (process.env.CLINIC_ASSISTANT_REMINDERS_ENABLED !== 'true') return { status: 'DISABLED' };
    const expiresAt = new Date(input.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || !input.text.trim() || input.text.length > 800 || !fieldForKind[input.kind]) throw new BadRequestException('Некорректное уведомление');
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const claim = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, hashtext(${input.ownerId}))`;
      const previous = await tx.ownerNotificationDelivery.findUnique({ where: { id } });
      if (previous) {
        if (previous.ownerId !== input.ownerId || previous.fingerprint !== fingerprint) throw new ConflictException('Ключ уведомления уже использован');
        if (previous.status === 'SENDING' && previous.attemptedAt.getTime() < now.getTime() - 60000) {
          await tx.ownerNotificationDelivery.update({ where: { id }, data: { status: 'UNKNOWN', completedAt: now, error: 'Отправка прервалась; повтор запрещён' } });
          return { status: 'UNKNOWN' };
        }
        return { status: previous.status };
      }
      if (expiresAt <= now) return { status: 'EXPIRED' };
      const preference = await tx.ownerNotificationPreference.upsert({ where: { ownerId: input.ownerId }, create: { ownerId: input.ownerId }, update: {} });
      if (!preference?.enabled || !preference[fieldForKind[input.kind]]) return { status: 'NO_CONSENT' };
      const binding = await tx.messengerBinding.findUnique({ where: { ownerId_channel: { ownerId: input.ownerId, channel: preference.channel } } });
      if (!binding || preference.channel !== 'MAX') return { status: 'NOT_LINKED' };
      const next = nextNotificationTime(now, preference.timezone, preference.quietStartMinute, preference.quietEndMinute);
      if (next > now) return { status: 'DEFERRED', retryAt: next.toISOString() };
      const dayKey = notificationLocalTime(now, preference.timezone).dayKey;
      // Recompute from instants, so changing timezone cannot reset today's counter.
      const attempts = await tx.ownerNotificationDelivery.findMany({ where: { ownerId: input.ownerId, attemptedAt: { gt: new Date(now.getTime() - 48 * 3600000) }, status: { in: ['SENDING', 'SENT', 'UNKNOWN'] } }, select: { attemptedAt: true } });
      const count = attempts.filter(x => notificationLocalTime(x.attemptedAt, preference.timezone).dayKey === dayKey).length;
      const limit = dailyLimit();
      if (count >= limit) return { status: 'DEFERRED', retryAt: new Date(now.getTime() + 3600000).toISOString() };
      const delivery = await tx.ownerNotificationDelivery.create({ data: { id, ownerId: input.ownerId, fingerprint, kind: input.kind, status: 'SENDING', consentVersion: preference.version, channel: preference.channel, dayKey, attemptedAt: now } });
      return { status: 'CLAIMED', delivery, recipient: binding.externalUserId };
    });
    if (claim.status !== 'CLAIMED' || !('delivery' in claim) || !claim.delivery) return claim;
    // Opt-out/change between claim and external send cancels the not-yet-started send.
    const current = await this.prisma.ownerNotificationPreference.findUnique({ where: { ownerId: input.ownerId } });
    const linked = await this.prisma.messengerBinding.findUnique({ where: { ownerId_channel: { ownerId: input.ownerId, channel: 'MAX' } } });
    if (!current?.enabled || !current[fieldForKind[input.kind]] || current.version !== claim.delivery.consentVersion || linked?.externalUserId !== claim.recipient) {
      await this.finish(id, 'CANCELLED'); return { status: 'NO_CONSENT' };
    }
    try {
      const receipt = await this.max.sendMessage(claim.recipient!, input.text);
      await this.finish(id, 'SENT', receipt.messageId); return { status: 'SENT' };
    } catch (error) {
      const rejected = Boolean(error && typeof error === 'object' && 'maxRejected' in error && error.maxRejected);
      const status = rejected ? 'REJECTED' : 'UNKNOWN';
      await this.finish(id, status); return { status };
    }
  }
  async result(id: string, now = new Date()) {
    await this.prisma.ownerNotificationDelivery.updateMany({ where: { id, status: 'SENDING', attemptedAt: { lt: new Date(now.getTime() - 60000) } }, data: { status: 'UNKNOWN', completedAt: now, error: 'Отправка прервалась; повтор запрещён' } });
    const delivery = await this.prisma.ownerNotificationDelivery.findUnique({ where: { id }, select: { status: true } });
    return { status: delivery?.status || 'MISSING' };
  }
  private finish(id: string, status: string, messageId?: string) {
    return this.prisma.ownerNotificationDelivery.updateMany({ where: { id, status: 'SENDING' }, data: { status, completedAt: new Date(), providerMessageId: messageId, error: status === 'UNKNOWN' ? 'Нет подтверждения доставки; автоматический повтор запрещён' : status === 'REJECTED' ? 'MAX отклонил отправку; требуется другой способ связи' : null } });
  }
}
function dailyLimit() { const value = Number(process.env.CLINIC_ASSISTANT_NOTIFICATION_DAILY_LIMIT || 3); return Number.isInteger(value) ? Math.min(10, Math.max(1, value)) : 3; }
