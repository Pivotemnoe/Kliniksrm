import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { AuthEmployee, AuthContext } from '../auth/auth.types';
import { AppointmentsService } from '../appointments/appointments.service';
import { CreateAppointmentDto } from '../appointments/dto/create-appointment.dto';
import { GroomingCrmService } from '../grooming/grooming.service';
import { GroomingStaffNotificationsService } from '../grooming/grooming-staff-notifications.service';
import { OwnersService } from '../owners/owners.service';
import { CreateAnimalDto } from '../owners/dto/create-animal.dto';
import { normalizePhoneForLookup } from '../../common/phone';
import { assertStaffApp, assertStaffBooking, staffAppCodes, staffAppSettings } from './staff-app.policy';
import { StaffAppSettingsDto, StaffClientCreateDto } from './staff-app.dto';
import { createHash } from 'node:crypto';

const accessInclude = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissionOverrides: { include: { permission: true } } };
const contactSelect = { id: true, fullName: true, phone: true, animals: { where: { archivedAt: null }, select: { id: true, nickname: true, species: true, breed: true } } };
const isGroomer = (actor: AuthEmployee) => actor.accountScope === 'GROOMING' || actor.roles.includes('groomer');
const managesClinic = (actor: AuthEmployee) => actor.roles.some(role => ['director', 'administrator'].includes(role));

@Injectable()
export class StaffAppService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly auth: AuthService,
    private readonly appointments: AppointmentsService, private readonly grooming: GroomingCrmService,
    private readonly notices: GroomingStaffNotificationsService, private readonly owners: OwnersService) {}

  profile(actor: AuthEmployee) {
    const settings = actor.staffApp || staffAppSettings();
    let canBook = false;
    try { assertStaffBooking(actor, isGroomer(actor) ? 'grooming' : 'clinic'); canBook = true; } catch { /* Read-only is the default. */ }
    return { settings, kind: isGroomer(actor) ? 'GROOMING' : 'CLINIC',
      canBook,
      canManage: this.canManage(actor, true), canViewClinic: !isGroomer(actor) && actor.permissions.includes('appointments.read'), notificationMode: isGroomer(actor) ? 'INBOX_AND_WEB_PUSH' : 'IN_APP' };
  }
  private canManage(actor: AuthEmployee, groomingOnly = false) {
    return managesClinic(actor) && (actor.permissions.includes('employees.manage') || actor.permissions.includes('remote_access.manage')
      || (groomingOnly && actor.permissions.includes('grooming.manage')));
  }
  async settings(actor: AuthEmployee) {
    if (!this.canManage(actor, true)) throw new ForbiddenException('Настройки приложения недоступны');
    const all = this.canManage(actor);
    const employees = await this.prisma.employee.findMany({ where: { status: 'ACTIVE', ...(all ? {} : { OR: [{ accountScope: 'GROOMING' }, { roles: { some: { role: { code: 'groomer' } } } }] }) },
      include: accessInclude, orderBy: { fullName: 'asc' } });
    return employees.map(employee => { const current = this.auth.serializeEmployee(employee); return { id: employee.id,
      fullName: employee.fullName, position: employee.position, accountScope: employee.accountScope, updatedAt: employee.updatedAt,
      settings: current.staffApp, canClinicBook: employee.accountScope !== 'GROOMING' && current.permissions.includes('appointments.manage'),
      canGroomingBook: isGroomer(current) && current.permissions.includes('grooming.operate') }; });
  }
  async saveSettings(id: string, input: StaffAppSettingsDto, actor: AuthEmployee) {
    if (!this.canManage(actor, true)) throw new ForbiddenException('Настройки приложения недоступны');
    return this.prisma.$transaction(async tx => {
      const target = await tx.employee.findUnique({ where: { id }, include: accessInclude });
      if (!target || target.status !== 'ACTIVE') throw new NotFoundException('Сотрудник не найден');
      const employee = this.auth.serializeEmployee(target);
      if (!this.canManage(actor, isGroomer(employee))) throw new ForbiddenException('Можно настраивать только приложение грумеров');
      if (input.clinicBooking && (isGroomer(employee) || !employee.permissions.includes('appointments.manage'))
        || input.groomingBooking && (!isGroomer(employee) || !employee.permissions.includes('grooming.operate'))) {
        throw new BadRequestException('Сначала назначьте необходимые рабочие права сотрудника');
      }
      const changed = await tx.employee.updateMany({ where: { id, updatedAt: new Date(input.updatedAt) }, data: { updatedAt: new Date(Math.max(Date.now(), target.updatedAt.getTime() + 1)) } });
      if (!changed.count) throw new ConflictException('Настройки сотрудника изменились. Обновите список');
      for (const [key, code] of Object.entries(staffAppCodes)) {
        const permission = await tx.permission.upsert({ where: { code }, create: { code, title: { enabled: 'Приложение сотрудника', clinicBooking: 'Запись в клинику с телефона', groomingBooking: 'Свои записи грумера с телефона', notifications: 'Уведомления в приложении сотрудника' }[key]! }, update: {} });
        const effect = input[key as keyof typeof staffAppCodes] ? 'GRANT' : 'DENY';
        await tx.employeePermissionOverride.upsert({ where: { employeeId_permissionId: { employeeId: id, permissionId: permission.id } },
          create: { employeeId: id, permissionId: permission.id, effect }, update: { effect } });
      }
      await this.audit.log({ actorId: actor.id, action: 'employee.staff_app.update', entityType: 'Employee', entityId: id,
        metadata: { before: employee.staffApp, after: { enabled: input.enabled, clinicBooking: input.clinicBooking, groomingBooking: input.groomingBooking, notifications: input.notifications } } }, tx);
      return { ok: true };
    });
  }
  async agenda(actor: AuthEmployee, from: string, to: string, scope = 'mine') {
    assertStaffApp(actor);
    if (!['mine', 'clinic'].includes(scope)) throw new BadRequestException('Выберите своё расписание или расписание клиники');
    if (scope === 'clinic' && (isGroomer(actor) || !actor.permissions.includes('appointments.read'))) throw new ForbiddenException('Нет доступа к расписанию клиники');
    const start = new Date(from), end = new Date(to);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || +end - +start > 32 * 86400000) throw new BadRequestException('Выберите период до 31 дня');
    if (isGroomer(actor)) {
      if (!actor.permissions.includes('grooming.read')) throw new ForbiddenException('Нет доступа к грумингу');
      await this.grooming.overview(actor);
      return { kind: 'GROOMING', items: await this.grooming.bookings(actor, from, to), shifts: await this.grooming.shifts(actor, from, to) };
    }
    const items = actor.permissions.includes('appointments.read') ? await this.prisma.appointment.findMany({
      where: { startsAt: { gte: start, lt: end }, ...(scope === 'mine' ? { employeeId: actor.id } : {}) }, take: 500, orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true, status: true, comment: true, ownerId: true, animalId: true,
        animal: { select: { id: true, nickname: true, species: true, breed: true } }, owner: { select: { id: true, fullName: true, phone: true } },
        employee: { select: { fullName: true } }, room: { select: { name: true } } } }) : [];
    const shifts = await this.prisma.employeeShift.findMany({ where: { employeeId: actor.id, startsAt: { lt: end }, endsAt: { gt: start } },
      select: { id: true, startsAt: true, endsAt: true }, orderBy: { startsAt: 'asc' }, take: 100 });
    return { kind: 'CLINIC', items, shifts };
  }
  async inbox(actor: AuthEmployee) {
    assertStaffApp(actor);
    if (isGroomer(actor)) { if (!actor.permissions.includes('grooming.read')) throw new ForbiddenException('Нет доступа к уведомлениям'); return this.notices.inbox(actor); }
    const messages = actor.permissions.includes('notifications.read') ? await this.prisma.internalMessage.findMany({ where: { recipientId: actor.id },
      select: { id: true, body: true, readAt: true, createdAt: true, sender: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }) : [];
    const unread = actor.permissions.includes('notifications.read') ? await this.prisma.internalMessage.count({ where: { recipientId: actor.id, readAt: null } }) : 0;
    return { items: messages.map(item => ({ id: item.id, title: item.sender.fullName, body: item.body, readAt: item.readAt, createdAt: item.createdAt })), unread };
  }
  async tasks(actor: AuthEmployee) {
    assertStaffApp(actor);
    if (isGroomer(actor) || !actor.permissions.includes('tasks.read')) return [];
    const tasks = await this.prisma.task.findMany({ where: { OR: [{ assigneeId: actor.id }, { assigneeRoleCode: { in: actor.roles } }] },
      select: { id: true, title: true, comment: true, dueAt: true, status: true }, orderBy: { dueAt: 'asc' }, take: 50 });
    return tasks.map(({ comment, ...task }) => ({ ...task, description: comment }));
  }
  async markRead(id: string, actor: AuthEmployee) {
    assertStaffApp(actor);
    if (isGroomer(actor)) { if (!actor.permissions.includes('grooming.read')) throw new ForbiddenException('Нет доступа к уведомлениям'); return this.notices.markRead(actor, id); }
    if (!actor.permissions.includes('notifications.read')) throw new ForbiddenException('Нет доступа к сообщениям');
    const changed = await this.prisma.internalMessage.updateMany({ where: { id, recipientId: actor.id, readAt: null }, data: { readAt: new Date() } });
    if (!changed.count && !await this.prisma.internalMessage.findFirst({ where: { id, recipientId: actor.id }, select: { id: true } })) throw new NotFoundException('Сообщение не найдено');
    return { ok: true };
  }
  async pushConfig(context: AuthContext) { assertStaffApp(context.employee); await this.grooming.overview(context.employee); return this.notices.config(context); }
  async pushSubscribe(context: AuthContext, input: { endpoint: string; p256dh: string; auth: string }) { assertStaffApp(context.employee); await this.grooming.overview(context.employee); return this.notices.subscribe(context, input); }
  async pushUnsubscribe(context: AuthContext, endpoint: string) { assertStaffApp(context.employee); return this.notices.unsubscribe(context, endpoint); }
  async clients(actor: AuthEmployee, search = '') {
    assertStaffBooking(actor, isGroomer(actor) ? 'grooming' : 'clinic');
    if (isGroomer(actor)) return this.grooming.clients(actor, search);
    if (!actor.permissions.includes('owners.read') || !actor.permissions.includes('animals.read')) throw new ForbiddenException('Нет доступа к карточкам клиентов');
    if (search.trim().length < 2) return [];
    return this.prisma.owner.findMany({ where: { OR: [{ fullName: { contains: search.trim(), mode: 'insensitive' } }, { phone: { contains: search.trim() } }] }, select: contactSelect, take: 20 });
  }
  async lookupClient(phone: string, actor: AuthEmployee) {
    assertStaffBooking(actor, 'grooming');
    const normalized = normalizePhoneForLookup(phone);
    if (!normalized || normalized.length < 10) throw new BadRequestException('Введите полный номер телефона');
    const clients = await this.prisma.owner.findMany({ where: { phoneNormalized: normalized }, select: contactSelect, take: 2 });
    if (clients.length > 1) throw new ConflictException('Есть несколько карточек с этим номером. Попросите администратора уточнить клиента');
    return clients.map(client => ({ ...client, clientAccessToken: this.grooming.issueStaffClientAccess(actor, client.id) }));
  }
  async createClient(input: StaffClientCreateDto, actor: AuthEmployee) {
    assertStaffBooking(actor, 'grooming');
    const existing = await this.lookupClient(input.phone, actor);
    if (existing.length) return existing[0];
    const owner = await this.owners.createOwner({ fullName: input.fullName, phone: input.phone, source: 'GROOMING_STAFF' }, actor.id);
    return { id: owner.id, fullName: owner.fullName, phone: owner.phone, animals: [], clientAccessToken: this.grooming.issueStaffClientAccess(actor, owner.id) };
  }
  async createPet(ownerId: string, input: CreateAnimalDto, token: string | undefined, actor: AuthEmployee) {
    await this.grooming.assertStaffClientAccess(actor, ownerId, token);
    return this.owners.createAnimal({ ...input, ownerId }, actor.id);
  }
  async petCatalog(actor: AuthEmployee) {
    assertStaffBooking(actor, 'grooming');
    return this.prisma.animalSpecies.findMany({ include: { breeds: true }, orderBy: { title: 'asc' } });
  }
  async clinicResources(actor: AuthEmployee) {
    assertStaffBooking(actor, 'clinic');
    return { employees: await this.prisma.employee.findMany({ where: { status: 'ACTIVE', accountScope: 'CLINIC', roles: { some: { role: { code: 'doctor' } } } }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
      rooms: await this.prisma.room.findMany({ select: { id: true, name: true, officeId: true }, orderBy: { name: 'asc' } }) };
  }
  async createAppointment(input: CreateAppointmentDto & { clientKey: string }, actor: AuthEmployee) {
    assertStaffBooking(actor, 'clinic');
    const { clientKey, ...dto } = input;
    const stable = Object.fromEntries(Object.entries(dto).sort(([a], [b]) => a.localeCompare(b)));
    const fingerprint = createHash('sha256').update(JSON.stringify(stable)).digest('hex');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261028, hashtext(${actor.id + ':' + clientKey}))`;
      const previous = await tx.auditLog.findFirst({ where: { actorId: actor.id, action: 'staff_app.clinic_book', entityType: 'StaffAppCommand', entityId: clientKey }, select: { metadata: true } });
      if (previous) {
        const receipt = previous.metadata as { fingerprint: string; appointmentId: string };
        if (receipt.fingerprint !== fingerprint) throw new ConflictException('Запрос уже использован с другими данными');
        return { id: receipt.appointmentId };
      }
      const appointment = await this.appointments.createAppointmentInTransaction(tx, dto, actor.id);
      await this.audit.log({ actorId: actor.id, action: 'staff_app.clinic_book', entityType: 'StaffAppCommand', entityId: clientKey,
        metadata: { fingerprint, appointmentId: appointment.id } }, tx);
      return { id: appointment.id };
    });
  }
}
