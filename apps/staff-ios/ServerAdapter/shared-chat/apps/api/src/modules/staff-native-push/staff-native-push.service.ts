import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { ClinicModulesService } from '../clinic-modules/clinic-modules.service';
import { assertStaffApp } from '../staff-app/staff-app.policy';
import { NativePushDeviceDto } from './staff-native-push.dto';
import { PushTransportError, sendApns, sendFcm } from './native-push-transport';

const actorInclude = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissionOverrides: { include: { permission: true } } } as const;
const deviceInclude = { session: { include: { user: { include: { employee: { include: actorInclude } } } } },
  remoteDevice: { include: { organization: { include: { remoteAccessPolicy: true } } } } } as const;
const day = 86400000;
@Injectable()
export class StaffNativePushService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService,
    private readonly audit: AuditService, private readonly modules: ClinicModulesService) {}
  onApplicationBootstrap() {
    if (process.env.STAFF_NATIVE_PUSH_ENABLED === 'true' && this.key()) {
      this.timer = setInterval(() => void this.dispatch().catch(() => undefined), 8000); this.timer.unref();
    }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private key() {
    const value = process.env.STAFF_NATIVE_PUSH_ENCRYPTION_KEY_B64 || '';
    if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
    const key = Buffer.from(value, 'base64'); return key.length === 32 ? key : null;
  }
  private allowed(platform: string) {
    return (platform === 'ANDROID' ? process.env.STAFF_NATIVE_PUSH_ANDROID_APPLICATION_IDS || 'ru.temichevvet.staff' : process.env.STAFF_NATIVE_PUSH_IOS_BUNDLE_IDS || '')
      .split(',').map(value => value.trim()).filter(Boolean);
  }
  protected providerConfigured(platform: string) {
    if (platform === 'ANDROID') return Boolean(process.env.STAFF_NATIVE_PUSH_FCM_PROJECT_ID && process.env.STAFF_NATIVE_PUSH_FCM_CREDENTIALS_PATH && existsSync(process.env.STAFF_NATIVE_PUSH_FCM_CREDENTIALS_PATH));
    return Boolean(process.env.STAFF_NATIVE_PUSH_APNS_TEAM_ID && process.env.STAFF_NATIVE_PUSH_APNS_KEY_ID &&
      process.env.STAFF_NATIVE_PUSH_APNS_KEY_PATH && existsSync(process.env.STAFF_NATIVE_PUSH_APNS_KEY_PATH));
  }
  private assertContext(context: AuthContext) {
    assertStaffApp(context.employee);
    if (context.employee.staffApp?.notifications === false) throw new ForbiddenException('Уведомления отключены для сотрудника');
  }
  config(context: AuthContext, platform = 'ANDROID', applicationId?: string) {
    this.assertContext(context);
    if (!['ANDROID', 'IOS'].includes(platform)) throw new BadRequestException('Неизвестная платформа');
    const chosen = applicationId || this.allowed(platform)[0] || null;
    return { available: Boolean(process.env.STAFF_NATIVE_PUSH_ENABLED === 'true' && this.key() &&
      chosen && this.allowed(platform).includes(chosen) && this.providerConfigured(platform)),
      provider: platform === 'ANDROID' ? 'FCM' : 'APNS', applicationId: chosen,
      environment: platform === 'ANDROID' ? 'PRODUCTION' : process.env.STAFF_NATIVE_PUSH_APNS_ENVIRONMENT === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX' };
  }
  async register(context: AuthContext, input: NativePushDeviceDto) {
    const config = this.config(context, input.platform, input.applicationId);
    if (!config.available) throw new ServiceUnavailableException('Нативная доставка ещё не настроена для этого приложения');
    if (input.platform === 'ANDROID' ? !/^[A-Za-z0-9_:.\-]{32,4096}$/.test(input.token) : !/^[0-9a-f]{32,512}$/i.test(input.token)) throw new BadRequestException('Некорректный push token');
    const environment = input.platform === 'ANDROID' ? 'PRODUCTION' : input.environment;
    if (environment !== config.environment) throw new BadRequestException('Окружение APNs не совпадает с конфигурацией сервера');
    const tokenHash = createHash('sha256').update(input.platform + ':' + environment + ':' + input.token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * day);
    const result = await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(20261028,hashtext($1))', input.platform + ':' + input.applicationId + ':' + input.installationId);
      const where = { platform_applicationId_installationId: { platform: input.platform, applicationId: input.applicationId, installationId: input.installationId } };
      const previous = await tx.staffNativePushDevice.findUnique({ where });
      if (previous && previous.employeeId !== context.employee.id) throw new ConflictException('Устройство подключено к другому сотруднику');
      const tokenOwner = await tx.staffNativePushDevice.findUnique({ where: { tokenHash } });
      if (tokenOwner && tokenOwner.id !== previous?.id) {
        if (tokenOwner.employeeId !== context.employee.id || tokenOwner.applicationId !== input.applicationId) throw new ConflictException('Push token уже зарегистрирован');
        await tx.staffNativePushDevice.delete({ where: { id: tokenOwner.id } });
      }
      if (!previous && await tx.staffNativePushDevice.count({ where: { employeeId: context.employee.id, expiresAt: { gt: new Date() } } }) >= 10) throw new ConflictException('Достигнут лимит устройств');
      const data = { employeeId: context.employee.id, sessionId: context.sessionId, remoteDeviceId: context.remoteDeviceId,
        environment: environment!, tokenHash, tokenCiphertext: this.encrypt(input.token), expiresAt };
      const device = await tx.staffNativePushDevice.upsert({ where, create: { ...data, installationId: input.installationId, platform: input.platform, applicationId: input.applicationId },
        update: data, select: { id: true, expiresAt: true } });
      await this.audit.log({ actorId: context.employee.id, action: 'staff_app.native_push.register', entityType: 'StaffNativePushDevice', entityId: device.id,
        metadata: { platform: input.platform, applicationId: input.applicationId } }, tx);
      return device;
    });
    return result;
  }
  async remove(context: AuthContext, id: string) {
    // Revocation remains available when personal notifications were disabled in CRM.
    await this.prisma.staffNativePushDevice.deleteMany({ where: { id, employeeId: context.employee.id } });
    return { ok: true };
  }
  async event(context: AuthContext, id: string) {
    this.assertContext(context);
    const event = await this.prisma.staffNativePushEvent.findFirst({ where: { id, employeeId: context.employee.id } });
    if (!event) throw new NotFoundException('Событие не найдено');
    return { eventId: event.id, kind: event.kind, conversationEmployeeId: event.conversationEmployeeId, channelId: event.channelId };
  }
  private encrypt(token: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key()!, iv);
    const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
  }
  private decrypt(value: string) {
    const data = Buffer.from(value, 'base64url'), cipher = createDecipheriv('aes-256-gcm', this.key()!, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
  }
  private async eligible(device: any, event: any, now: Date) {
    const employee = device.session?.user?.employee, remote = device.remoteDevice;
    if (!employee || employee.status !== 'ACTIVE' || employee.id !== event.employeeId || device.employeeId !== event.employeeId || device.expiresAt <= now ||
      device.session.userId !== employee.userId || device.session.user.mustChangePassword) return false;
    // Notification-only grant may survive idle locking. Private API sessions are never extended here.
    if (device.session.accessType === 'REMOTE' && (!remote || remote.revokedAt || remote.employeeId !== employee.id || !remote.organization.remoteAccessPolicy?.enabled)) return false;
    const actor = this.auth.serializeEmployee(employee);
    if (actor.staffApp?.enabled === false || actor.staffApp?.notifications === false) return false;
    if (event.kind === 'INTERNAL_MESSAGE') return Boolean(await this.prisma.internalMessage.findFirst({
      where: { id: event.sourceId, recipientId: employee.id, senderId: event.conversationEmployeeId, readAt: null }, select: { id: true } }));
    if (event.kind === 'CLINIC_CHAT') {
      if (!event.channelId) return false;
      const member = await this.prisma.staffClinicChatMembership.findUnique({ where: { channelId_employeeId: { channelId: event.channelId, employeeId: employee.id } } });
      const message = await this.prisma.staffClinicChatMessage.findFirst({ where: { id: event.sourceId, channelId: event.channelId } });
      return Boolean(member && message && message.senderId !== employee.id && message.sequence > member.readThroughSequence);
    }
    if (event.kind !== 'GROOMING' || !actor.permissions.includes('grooming.read')) return false;
    const installation = await this.modules.installation('GROOMING');
    if (!installation.enabled || !await this.modules.entitlement('GROOMING')) return false;
    const notice = await this.prisma.groomingStaffNotice.findFirst({ where: { id: event.sourceId, employeeId: employee.id }, include: { reservation: true } });
    return Boolean(notice && !notice.readAt && !notice.supersededAt && notice.expiresAt > now &&
      (!notice.reservation || notice.reservation.version === notice.reservationVersion &&
        (notice.reservation.employeeId === employee.id || notice.event === 'REASSIGNED')));
  }
  protected async sendDevice(device: any, event: any, deliveryId: string) {
    const data: Record<string, string> = { eventId: event.id, kind: event.kind };
    if (event.kind === 'INTERNAL_MESSAGE' && event.conversationEmployeeId) data.conversationEmployeeId = event.conversationEmployeeId;
    if (event.kind === 'CLINIC_CHAT' && event.channelId) data.channelId = event.channelId;
    const token = this.decrypt(device.tokenCiphertext);
    return device.platform === 'ANDROID' ? this.sendFcmPayload({ token, data }) :
      this.sendApnsPayload({ token, data, applicationId: device.applicationId, environment: device.environment, deliveryId });
  }
  protected sendFcmPayload(input: Parameters<typeof sendFcm>[0]) { return sendFcm(input); }
  protected sendApnsPayload(input: Parameters<typeof sendApns>[0]) { return sendApns(input); }
  async dispatch(now = new Date()) {
    if (this.running || process.env.STAFF_NATIVE_PUSH_ENABLED !== 'true' || !this.key()) return;
    this.running = true;
    try {
      await this.prisma.staffNativePushDelivery.updateMany({ where: { state: 'SENDING', attemptedAt: { lt: new Date(now.getTime() - 60000) } },
        data: { state: 'UNKNOWN', lastError: 'Исход предыдущей отправки неизвестен' } });
      // Grooming keeps its existing common CRM notices; native events are additive and deduplicated.
      const notices = await this.prisma.groomingStaffNotice.findMany({ where: { readAt: null, supersededAt: null, expiresAt: { gt: now } }, take: 200, orderBy: { createdAt: 'desc' } });
      for (const notice of notices) await this.prisma.staffNativePushEvent.upsert({ where: { dedupeKey: 'grooming:' + notice.id },
        create: { employeeId: notice.employeeId, kind: 'GROOMING', sourceId: notice.id, dedupeKey: 'grooming:' + notice.id, expiresAt: notice.expiresAt }, update: {} });
      const events = await this.prisma.staffNativePushEvent.findMany({ where: { retiredAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: 'asc' }, take: 200 });
      for (const event of events) {
        const devices = await this.prisma.staffNativePushDevice.findMany({ where: { employeeId: event.employeeId, expiresAt: { gt: now } }, include: deviceInclude });
        for (const device of devices) {
          if (!await this.eligible(device, event, now)) continue;
          await this.prisma.staffNativePushDelivery.upsert({ where: { eventId_deviceId: { eventId: event.id, deviceId: device.id } },
            create: { eventId: event.id, deviceId: device.id, nextAttemptAt: now }, update: {} });
        }
        await this.prisma.staffNativePushEvent.update({ where: { id: event.id }, data: { retiredAt: now } });
      }
      const deliveries = await this.prisma.staffNativePushDelivery.findMany({ where: { state: 'QUEUED', nextAttemptAt: { lte: now } },
        take: 100, orderBy: { nextAttemptAt: 'asc' }, include: { event: true, device: { include: deviceInclude } } });
      for (const item of deliveries) {
        if (item.event.expiresAt <= now || !await this.eligible(item.device, item.event, now)) {
          await this.prisma.staffNativePushDelivery.updateMany({ where: { id: item.id, state: 'QUEUED' }, data: { state: 'CANCELLED' } }); continue;
        }
        if (!(await this.prisma.staffNativePushDelivery.updateMany({ where: { id: item.id, state: 'QUEUED' },
          data: { state: 'SENDING', attemptedAt: now, attempts: { increment: 1 } } })).count) continue;
        try {
          const receipt = await this.sendDevice(item.device, item.event, item.id);
          await this.prisma.staffNativePushDelivery.updateMany({ where: { id: item.id, state: 'SENDING' }, data: { state: 'ACCEPTED', providerReceipt: receipt, lastError: null } });
        } catch (error) {
          if (error instanceof PushTransportError && error.invalidToken) { await this.prisma.staffNativePushDevice.deleteMany({ where: { id: item.deviceId } }); continue; }
          const retry = error instanceof PushTransportError && error.rejectedRetryable && item.attempts < 3;
          await this.prisma.staffNativePushDelivery.updateMany({ where: { id: item.id, state: 'SENDING' }, data: {
            state: retry ? 'QUEUED' : error instanceof PushTransportError ? 'FAILED' : 'UNKNOWN',
            nextAttemptAt: retry ? new Date(now.getTime() + 60000) : item.nextAttemptAt,
            lastError: error instanceof PushTransportError ? 'Provider status ' + error.code : 'Доставка не подтверждена, автоматический повтор остановлен',
          } });
        }
      }
    } finally { this.running = false; }
  }
}
