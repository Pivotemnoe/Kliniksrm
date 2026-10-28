import { BadRequestException, ConflictException, Injectable, NotFoundException, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContext, AuthEmployee } from '../auth/auth.types';
import { ClinicModulesService } from '../clinic-modules/clinic-modules.service';

const day = 86400000;
const employeeInclude = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissionOverrides: { include: { permission: true } } } satisfies Prisma.EmployeeInclude;
type Recipient = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;
function canRead(employee: Recipient) {
  const override = employee.permissionOverrides.find(p => p.permission.code === 'grooming.read');
  return employee.status === 'ACTIVE' && (override ? override.effect !== 'DENY' : employee.roles.some(r => r.role.permissions.some(p => p.permission.code === 'grooming.read')));
}
function manager(employee: Recipient) { return employee.roles.some(r => ['director', 'administrator'].includes(r.role.code)); }

export async function supersedeGroomingStaffNotices(tx: Prisma.TransactionClient, reservationId: string, now: Date) {
  await tx.groomingPushDelivery.updateMany({ where: { notice: { reservationId }, status: 'QUEUED' }, data: { status: 'CANCELLED', lastError: 'Запись изменилась' } });
  await tx.groomingStaffNotice.updateMany({ where: { reservationId, supersededAt: null }, data: { supersededAt: now } });
}

// The notice and its device outbox are committed in the reservation transaction.
export async function queueGroomingStaffNotices(tx: Prisma.TransactionClient, booking: { id: string; employeeId: string; version: number; startsAt: Date; endsAt?: Date; serviceTitle: string; animal: { nickname: string }; location: { timezone: string } }, event: string, now: Date, previousEmployeeId?: string) {
  await supersedeGroomingStaffNotices(tx, booking.id, now);
  const employees = await tx.employee.findMany({ where: { status: 'ACTIVE', OR: [{ id: { in: [booking.employeeId, ...(previousEmployeeId ? [previousEmployeeId] : [])] } }, { roles: { some: { role: { code: { in: ['director', 'administrator'] } } } } }] }, include: employeeInclude });
  const when = new Intl.DateTimeFormat('ru-RU', { timeZone: booking.location.timezone, dateStyle: 'short', timeStyle: 'short' }).format(booking.startsAt);
  const ends = booking.endsAt ? '–' + new Intl.DateTimeFormat('ru-RU', { timeZone: booking.location.timezone, hour: '2-digit', minute: '2-digit' }).format(booking.endsAt) : '';
  for (const employee of employees.filter(canRead)) {
    const reassigned = !manager(employee) && employee.id !== booking.employeeId;
    const title = reassigned ? 'Запись передана другому грумеру' : event === 'CANCELLED' ? 'Запись отменена' : event === 'DURATION_CHANGED' ? 'Длительность уточнена' : event === 'RESCHEDULED' ? 'Запись перенесена' : 'Новая запись';
    await createNotice(tx, { reservationId: booking.id, reservationVersion: booking.version, employeeId: employee.id, event: reassigned ? 'REASSIGNED' : event, dedupeKey: `${booking.id}:${booking.version}:${event}:${employee.id}`, title, body: reassigned ? 'Освободившееся время обновлено в вашем календаре.' : `${booking.animal.nickname} · ${booking.serviceTitle} · ${when}${ends}`.slice(0, 600), href: reassigned ? '/grooming/calendar' : `/grooming/bookings/${booking.id}`, expiresAt: new Date(now.getTime() + day), createdAt: now }, now);
  }
}

async function createNotice(tx: Prisma.TransactionClient, data: Prisma.GroomingStaffNoticeUncheckedCreateInput, now: Date) {
  const notice = await tx.groomingStaffNotice.create({ data });
  const devices = await tx.groomingPushSubscription.findMany({ where: { employeeId: notice.employeeId, expiresAt: { gt: now } }, select: { id: true } });
  if (devices.length) await tx.groomingPushDelivery.createMany({ data: devices.map(device => ({ noticeId: notice.id, subscriptionId: device.id, scheduledAt: now })), skipDuplicates: true });
  return notice;
}

export function validateGroomingPushEndpoint(endpoint: string) {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new BadRequestException('Некорректный адрес push-службы'); }
  const host = url.hostname;
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(host) || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash || endpoint.length > 2048) throw new BadRequestException('Эта push-служба не поддерживается');
}
function checkKey(value: string, length: number) { return /^[A-Za-z0-9_-]+={0,2}$/.test(value) && Buffer.from(value, 'base64url').length === length; }
function vapidDetails() {
  const subject = process.env.GROOMING_STAFF_VAPID_SUBJECT?.trim(), publicKey = process.env.GROOMING_STAFF_VAPID_PUBLIC_KEY?.trim(), privateKey = process.env.GROOMING_STAFF_VAPID_PRIVATE_KEY?.trim();
  if (process.env.GROOMING_STAFF_PUSH_ENABLED !== 'true' || !subject || !publicKey || !privateKey || !checkKey(publicKey, 65) || !checkKey(privateKey, 32) || !/^(?:mailto:|https:\/\/)/.test(subject)) return null;
  return { subject, publicKey, privateKey };
}

@Injectable()
export class GroomingStaffNotificationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly modules: ClinicModulesService) {}
  onApplicationBootstrap() { if (vapidDetails()) { this.timer = setInterval(() => void this.dispatch().catch(() => undefined), 10000); this.timer.unref(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async inbox(actor: AuthEmployee) {
    const scope = this.noticeScope(actor);
    const [items, unread] = await Promise.all([
      this.prisma.groomingStaffNotice.findMany({ where: scope, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, reservationId: true, event: true, title: true, body: true, href: true, readAt: true, supersededAt: true, createdAt: true } }),
      this.prisma.groomingStaffNotice.count({ where: { ...scope, readAt: null, supersededAt: null } }),
    ]);
    return { items, unread };
  }
  async markRead(actor: AuthEmployee, id?: string) {
    const result = await this.prisma.groomingStaffNotice.updateMany({ where: { ...this.noticeScope(actor), ...(id ? { id } : {}), readAt: null }, data: { readAt: new Date() } });
    if (id && !result.count && !await this.prisma.groomingStaffNotice.findFirst({ where: { ...this.noticeScope(actor), id } })) throw new NotFoundException('Уведомление не найдено');
    return { ok: true };
  }
  private noticeScope(actor: AuthEmployee): Prisma.GroomingStaffNoticeWhereInput {
    return { employeeId: actor.id, ...(actor.roles.some(r => ['director', 'administrator'].includes(r)) ? {} : { OR: [{ reservationId: null }, { event: 'REASSIGNED' }, { reservation: { employeeId: actor.id } }] }) };
  }
  async config(context: AuthContext) {
    const vapid = vapidDetails();
    const devices = await this.prisma.groomingPushSubscription.findMany({ where: { employeeId: context.employee.id, sessionId: context.sessionId, expiresAt: { gt: new Date() } }, select: { id: true, endpoint: true, expiresAt: true, lastSuccessAt: true } });
    return { available: Boolean(vapid), publicKey: vapid?.publicKey || null, devices };
  }
  async subscribe(context: AuthContext, input: { endpoint: string; p256dh: string; auth: string }) {
    const vapid = vapidDetails();
    if (!vapid) throw new ServiceUnavailableException('Push-уведомления ещё не настроены на сервере');
    validateGroomingPushEndpoint(input.endpoint);
    if (!checkKey(input.p256dh, 65) || !checkKey(input.auth, 16)) throw new BadRequestException('Некорректные ключи устройства');
    const expiresAt = new Date(Date.now() + 30 * day);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, 3)`;
      const previous = await tx.groomingPushSubscription.findUnique({ where: { endpoint: input.endpoint } });
      if (previous && previous.employeeId !== context.employee.id) throw new ConflictException('Устройство подключено к другому сотруднику. Подключите уведомления заново');
      const subscription = await tx.groomingPushSubscription.upsert({ where: { endpoint: input.endpoint }, create: { ...input, employeeId: context.employee.id, sessionId: context.sessionId, remoteDeviceId: context.remoteDeviceId, vapidKey: vapid.publicKey, expiresAt }, update: { p256dh: input.p256dh, auth: input.auth, sessionId: context.sessionId, remoteDeviceId: context.remoteDeviceId, vapidKey: vapid.publicKey, expiresAt } });
      return { id: subscription.id, expiresAt };
    });
  }
  async unsubscribe(context: AuthContext, endpoint: string) {
    await this.prisma.groomingPushSubscription.deleteMany({ where: { employeeId: context.employee.id, endpoint } });
    return { ok: true };
  }
  async test(context: AuthContext) {
    if (!vapidDetails()) throw new ServiceUnavailableException('Push-уведомления ещё не настроены на сервере');
    if (!await this.prisma.groomingPushSubscription.count({ where: { employeeId: context.employee.id, sessionId: context.sessionId, expiresAt: { gt: new Date() } } })) throw new BadRequestException('Сначала включите уведомления на этом устройстве');
    const now = new Date();
    if (await this.prisma.groomingStaffNotice.count({ where: { employeeId: context.employee.id, event: 'TEST', createdAt: { gt: new Date(now.getTime() - 60000) } } })) throw new ConflictException('Проверка уже отправлена. Подождите минуту');
    await this.prisma.$transaction(tx => createNotice(tx, { employeeId: context.employee.id, event: 'TEST', dedupeKey: `test:${context.employee.id}:${now.getTime()}`, title: 'Проверка уведомлений', body: 'Уведомления груминга подключены. Новые записи появятся здесь.', href: '/grooming/notifications', expiresAt: new Date(now.getTime() + 600000) }, now));
    return { queued: true };
  }

  // A separate notification-only device grant survives idle screen locking.
  // Explicit logout/password revocation deletes its session and cascades the grant.
  // Payloads never include names, phones, animals, services or appointment times.
  async dispatch(now = new Date()) {
    const vapid = vapidDetails();
    if (this.running || !vapid) return;
    this.running = true;
    try {
      const installation = await this.modules.installation('GROOMING');
      if (!installation.enabled || !await this.modules.entitlement('GROOMING')) return;
      await this.prisma.groomingPushDelivery.updateMany({ where: { status: 'SENDING', attemptedAt: { lt: new Date(now.getTime() - 60000) } }, data: { status: 'UNKNOWN', lastError: 'Доставка не подтверждена; автоматический повтор остановлен' } });
      const items = await this.prisma.groomingPushDelivery.findMany({ where: { status: 'QUEUED', scheduledAt: { lte: now } }, take: 50, orderBy: { scheduledAt: 'asc' }, include: { notice: { include: { reservation: true, employee: { include: employeeInclude } } }, subscription: { include: { session: true, remoteDevice: { include: { organization: { include: { remoteAccessPolicy: true } } } } } } } });
      for (const item of items) {
        const { notice, subscription } = item, remote = subscription.remoteDevice;
        const invalid = notice.supersededAt || notice.readAt || notice.expiresAt <= now || subscription.expiresAt <= now || subscription.vapidKey !== vapid.publicKey || subscription.employeeId !== notice.employeeId || !canRead(notice.employee) || subscription.session.userId !== notice.employee.userId || (subscription.session.accessType === 'REMOTE' && (!remote || remote.revokedAt || remote.employeeId !== notice.employeeId || !remote.organization.remoteAccessPolicy?.enabled)) || (notice.reservation && (notice.reservation.version !== notice.reservationVersion || (!manager(notice.employee) && notice.reservation.employeeId !== notice.employeeId && notice.event !== 'REASSIGNED')));
        if (invalid) { await this.prisma.groomingPushDelivery.updateMany({ where: { id: item.id, status: 'QUEUED' }, data: { status: 'CANCELLED', lastError: 'Событие прочитано, изменилось или доступ отозван' } }); continue; }
        if (!(await this.prisma.groomingPushDelivery.updateMany({ where: { id: item.id, status: 'QUEUED' }, data: { status: 'SENDING', attemptedAt: now, attempts: { increment: 1 } } })).count) continue;
        const payload = JSON.stringify({ title: 'TemichevVet · Груминг', body: notice.event === 'TEST' ? 'Проверка: уведомления подключены.' : 'Новое событие в вашем расписании. Откройте кабинет.', url: notice.href, tag: `grooming-staff:${notice.id}`, noticeId: notice.id });
        try {
          await this.send(subscription, payload, { TTL: Math.max(1, Math.min(3600, Math.floor((notice.expiresAt.getTime() - now.getTime()) / 1000))), vapidDetails: vapid, timeout: 10000, urgency: 'normal' });
          await this.prisma.groomingPushDelivery.updateMany({ where: { id: item.id, status: 'SENDING' }, data: { status: 'SENT', sentAt: now, lastError: null } });
          await this.prisma.groomingPushSubscription.updateMany({ where: { id: subscription.id }, data: { lastSuccessAt: now } });
        } catch (error) {
          const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
          if ([404, 410].includes(status)) { await this.prisma.groomingPushSubscription.deleteMany({ where: { id: subscription.id } }); continue; }
          const retry = [429, 503].includes(status) && item.attempts < 4;
          await this.prisma.groomingPushDelivery.updateMany({ where: { id: item.id, status: 'SENDING' }, data: { status: retry ? 'QUEUED' : status ? 'FAILED' : 'UNKNOWN', scheduledAt: retry ? new Date(now.getTime() + 60000) : item.scheduledAt, lastError: status ? `Push-служба: ${status}` : 'Доставка не подтверждена; автоматический повтор остановлен' } });
        }
      }
    } finally { this.running = false; }
  }
  // Instance method permits a fake transport in isolated QA without network calls.
  protected send(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string, options: webpush.RequestOptions) {
    return webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, options);
  }
}
