import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { ClinicModulesService } from '../clinic-modules/clinic-modules.service';
import { normalizePhoneForLookup } from '../../common/phone';
import { queueGroomingStaffNotices, supersedeGroomingStaffNotices } from './grooming-staff-notifications.service';
import { GroomingBookDto, GroomingCancelDto, GroomingChangeDto, GroomingLocationDto, GroomingOptionsDto, GroomingPetDto, GroomingRuleDto, GroomingServiceDto, GroomingSettingsDto, GroomingSpecialistDto, GroomingStatusDto, GroomingWorkPeriodDto, GroomingWorkplaceDto } from './grooming.dto';

const minute = 60000, day = 86400000;
export const activeGroomingStatuses = ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'];
const ruleInclude = { specialist: { include: { employee: true } }, service: true, location: true, workplace: true } satisfies Prisma.GroomingServiceRuleInclude;
const bookingInclude = { rule: { select: { serviceId: true } }, animal: { select: { id: true, nickname: true, species: true, breed: true } }, owner: { select: { id: true, fullName: true, phone: true } }, employee: { select: { id: true, fullName: true } }, location: { select: { id: true, name: true, timezone: true } }, workplace: { select: { id: true, name: true } } } satisfies Prisma.GroomingReservationInclude;
type Rule = Prisma.GroomingServiceRuleGetPayload<{ include: typeof ruleInclude }>;
type Booking = Prisma.GroomingReservationGetPayload<{ include: typeof bookingInclude }>;
type Offer = { ownerId: string; animalId: string; ruleId: string; ruleVersion: number; serviceVersion: string; startsAt: string; expiresAt: string; species: string; size: string; coat: string; ignoreId?: string; staff: boolean };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const lockGroomingSchedule = (tx: Prisma.TransactionClient) => tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, 2)`;

@Injectable()
export class GroomingCrmService {
  constructor(private readonly prisma: PrismaService, private readonly modules: ClinicModulesService, private readonly audit: AuditService) {}

  private manager(actor: AuthEmployee) { return actor.roles.some(r => ['director', 'administrator'].includes(r)); }
  private scope(actor: AuthEmployee): Prisma.GroomingReservationWhereInput { return this.manager(actor) ? {} : { employeeId: actor.id }; }
  async settings() {
    const installation = await this.modules.installation('GROOMING');
    return this.prisma.groomingSettings.upsert({ where: { installationId: installation.id }, create: { installationId: installation.id }, update: {} });
  }
  private async writable(tx?: Prisma.TransactionClient, selfService = false) {
    const installation = await this.modules.assertEnabled('GROOMING');
    const db = tx || this.prisma;
    if (tx) await tx.$queryRaw`SELECT id FROM "ClinicModuleInstallation" WHERE id = ${installation.id} FOR UPDATE`;
    const current = await db.clinicModuleInstallation.findUniqueOrThrow({ where: { id: installation.id } });
    if (!current.enabled) throw new ForbiddenException('Груминг отключён. Новая запись недоступна');
    const settings = await db.groomingSettings.findUnique({ where: { installationId: current.id } });
    if (selfService && !settings?.selfBookingEnabled) throw new ForbiddenException('Самостоятельная запись сейчас отключена');
    return { installation: current, settings };
  }
  async overview(actor: AuthEmployee) {
    const installation = await this.modules.installation('GROOMING');
    const entitled = await this.modules.entitlement('GROOMING');
    if ((!installation.enabled || !entitled) && !actor.roles.includes('director')) throw new ForbiddenException('Модуль груминга не подключён');
    const settings = await this.settings();
    const specialists = await this.prisma.groomingSpecialist.findMany({ where: { installationId: installation.id, ...(this.manager(actor) ? {} : { employeeId: actor.id }) }, include: { employee: { select: { id: true, fullName: true, status: true } } }, orderBy: { displayName: 'asc' } });
    const rules = await this.prisma.groomingServiceRule.findMany({ where: { installationId: installation.id, ...(this.manager(actor) ? {} : { specialist: { employeeId: actor.id } }) }, include: ruleInclude, orderBy: { createdAt: 'asc' } });
    const canManage = actor.permissions.includes('grooming.manage'), canSchedule = canManage || actor.permissions.includes('grooming.schedule');
    const resources = canManage || canSchedule ? {
      employees: await this.prisma.employee.findMany({ where: { status: 'ACTIVE' }, select: { id: true, fullName: true } }),
      locations: await this.prisma.groomingLocation.findMany({ where: { installationId: installation.id }, orderBy: { name: 'asc' } }),
      workplaces: await this.prisma.groomingWorkplace.findMany({ where: { location: { installationId: installation.id } }, orderBy: { name: 'asc' } }),
      services: await this.prisma.groomingService.findMany({ where: { installationId: installation.id }, orderBy: { title: 'asc' } }),
    } : null;
    return { installation, entitled, settings: canManage ? settings : { selfBookingEnabled: settings.selfBookingEnabled }, specialists: specialists.map(s => canManage ? s : { ...s, maxUserId: undefined }), rules, resources, canManage, canSchedule, limited: !installation.enabled || !entitled };
  }
  async saveSettings(input: GroomingSettingsDto, actor: AuthEmployee) {
    const previous = await this.settings();
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const { version, ...data } = input;
      const changed = await tx.groomingSettings.updateMany({ where: { installationId: previous.installationId, version }, data: { ...data, reminderHours: [...new Set(data.reminderHours)], administratorMaxIds: [...new Set(data.administratorMaxIds)], version: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('Настройки изменились. Обновите страницу');
      await this.audit.log({ actorId: actor.id, action: 'grooming.settings.save', entityType: 'GroomingSettings', entityId: previous.installationId }, tx);
      return tx.groomingSettings.findUniqueOrThrow({ where: { installationId: previous.installationId } });
    });
  }
  async saveLocation(input: GroomingLocationDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    try { new Intl.DateTimeFormat('ru-RU', { timeZone: input.timezone }); } catch { throw new BadRequestException('Проверьте часовой пояс'); }
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx); const { version, ...data } = input;
      let result;
      if (id) { const changed = await tx.groomingLocation.updateMany({ where: { id, installationId: installation.id, version: version ?? -1 }, data: { ...data, version: { increment: 1 } } }); if (!changed.count) throw new ConflictException('Место уже изменилось. Обновите страницу'); result = await tx.groomingLocation.findUniqueOrThrow({ where: { id } }); }
      else result = await tx.groomingLocation.create({ data: { ...data, installationId: installation.id } });
      await this.audit.log({ actorId: actor.id, action: 'grooming.location.save', entityType: 'GroomingLocation', entityId: result.id }, tx); return result;
    });
  }
  async saveWorkplace(input: GroomingWorkplaceDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx); const { version, ...data } = input;
      const location = await tx.groomingLocation.findFirst({ where: { id: input.locationId, installationId: installation.id } });
      if (!location) throw new BadRequestException('Выберите место из модуля груминга');
      let result;
      if (id) { const changed = await tx.groomingWorkplace.updateMany({ where: { id, location: { installationId: installation.id }, version: version ?? -1 }, data: { ...data, version: { increment: 1 } } }); if (!changed.count) throw new ConflictException('Рабочее место уже изменилось'); result = await tx.groomingWorkplace.findUniqueOrThrow({ where: { id } }); }
      else result = await tx.groomingWorkplace.create({ data });
      await this.audit.log({ actorId: actor.id, action: 'grooming.workplace.save', entityType: 'GroomingWorkplace', entityId: result.id }, tx); return result;
    });
  }
  async saveService(input: GroomingServiceDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx); const { version, ...data } = input;
      let result;
      if (id) { const changed = await tx.groomingService.updateMany({ where: { id, installationId: installation.id, version: version ?? -1 }, data: { ...data, version: { increment: 1 } } }); if (!changed.count) throw new ConflictException('Услуга уже изменилась'); result = await tx.groomingService.findUniqueOrThrow({ where: { id } }); }
      else result = await tx.groomingService.create({ data: { ...data, installationId: installation.id } });
      await this.audit.log({ actorId: actor.id, action: 'grooming.service.save', entityType: 'GroomingService', entityId: result.id }, tx); return result;
    });
  }
  async shifts(actor: AuthEmployee, from?: string, to?: string) {
    const overview = await this.overview(actor);
    return (await this.prisma.groomingWorkPeriod.findMany({ where: { specialistId: { in: overview.specialists.map(s => s.id) }, ...(from || to ? { startsAt: { ...(to ? { lt: date(to) } : {}) }, endsAt: { ...(from ? { gt: date(from) } : {}) } } : {}) }, include: { specialist: { include: { employee: { select: { id: true, fullName: true } } } }, location: { select: { id: true, name: true } } }, orderBy: { startsAt: 'asc' }, take: 500 })).map(p => ({ ...p, employeeId: p.specialist.employeeId, employee: p.specialist.employee }));
  }
  async saveShift(input: GroomingWorkPeriodDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    const startsAt = date(input.startsAt), endsAt = date(input.endsAt);
    if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > (input.kind === 'WORK' ? 24 * 3600000 : 90 * day)) throw new BadRequestException('Проверьте начало и окончание интервала');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const specialist = await tx.groomingSpecialist.findFirst({ where: { employeeId: input.employeeId, installationId: installation.id } });
      const location = await tx.groomingLocation.findFirst({ where: { id: input.locationId, installationId: installation.id } });
      if (!specialist || !location) throw new BadRequestException('Выберите специалиста и место груминга');
      const previous = id ? await tx.groomingWorkPeriod.findFirst({ where: { id, specialist: { installationId: installation.id } } }) : null;
      if (id && (!previous || previous.version !== input.version || previous.specialistId !== specialist.id)) throw new ConflictException('Интервал уже изменился. Обновите страницу');
      if (input.isActive && input.kind === 'WORK' && await tx.groomingWorkPeriod.findFirst({ where: { ...(id ? { id: { not: id } } : {}), specialistId: specialist.id, kind: 'WORK', isActive: true, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })) throw new ConflictException('У специалиста уже есть смена в это время');
      const future = await tx.groomingReservation.findMany({ where: { employeeId: specialist.employeeId, status: { in: activeGroomingStatuses }, startsAt: { gt: new Date() } } });
      for (const booking of future) {
        if (input.isActive && input.kind === 'BLOCK' && startsAt < booking.blockedUntil && endsAt > booking.startsAt) throw new ConflictException('В этом интервале есть запись. Сначала перенесите её');
        if (previous?.kind === 'WORK' && previous.startsAt <= booking.startsAt && previous.endsAt >= booking.blockedUntil && previous.locationId === booking.locationId) {
          const covered = input.isActive && input.kind === 'WORK' && input.locationId === booking.locationId && startsAt <= booking.startsAt && endsAt >= booking.blockedUntil || Boolean(await tx.groomingWorkPeriod.findFirst({ where: { id: { not: id }, specialistId: specialist.id, locationId: booking.locationId, kind: 'WORK', isActive: true, startsAt: { lte: booking.startsAt }, endsAt: { gte: booking.blockedUntil } } }));
          if (!covered) throw new ConflictException('Смена содержит будущую запись. Сначала перенесите её');
        }
      }
      const { employeeId, version, ...rest } = input, data = { ...rest, specialistId: specialist.id, startsAt, endsAt };
      const saved = id ? await tx.groomingWorkPeriod.update({ where: { id }, data: { ...data, version: { increment: 1 } } }) : await tx.groomingWorkPeriod.create({ data });
      await this.audit.log({ actorId: actor.id, action: 'grooming.work_period.save', entityType: 'GroomingWorkPeriod', entityId: saved.id }, tx); return saved;
    });
  }
  async saveSpecialist(input: GroomingSpecialistDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    const employee = await this.prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee || (input.isActive && employee.status !== 'ACTIVE')) throw new BadRequestException('Выберите действующего сотрудника');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const { version, ...fields } = input;
      const data = { ...fields, displayName: fields.displayName.trim(), maxUserId: fields.maxUserId || null };
      if (id) {
        const previous = await tx.groomingSpecialist.findFirst({ where: { id, installationId: installation.id } });
        if (!previous || previous.employeeId !== input.employeeId) throw new BadRequestException('Сотрудника профиля изменить нельзя');
        const changed = await tx.groomingSpecialist.updateMany({ where: { id, version: version ?? -1 }, data: { ...data, version: { increment: 1 } } });
        if (!changed.count) throw new ConflictException('Профиль изменился. Обновите страницу');
      } else await tx.groomingSpecialist.create({ data: { ...data, installationId: installation.id } });
      await this.audit.log({ actorId: actor.id, action: 'grooming.specialist.save', entityType: 'GroomingSpecialist', entityId: id || input.employeeId }, tx);
      return { ok: true };
    });
  }
  async saveRule(input: GroomingRuleDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    if ([input.durationMinutes, input.bufferMinutes, input.stepMinutes].some(n => n % 5)) throw new BadRequestException('Длительность, подготовка и шаг должны быть кратны 5 минутам');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const specialist = await tx.groomingSpecialist.findFirst({ where: { id: input.specialistId, installationId: installation.id }, include: { employee: true } });
      const workplace = await tx.groomingWorkplace.findUnique({ where: { id: input.workplaceId }, include: { location: true } });
      const service = await tx.groomingService.findUnique({ where: { id: input.serviceId } });
      if (!specialist || !workplace || workplace.location.installationId !== installation.id || workplace.locationId !== input.locationId || !service || service.installationId !== installation.id || !specialist.species.includes(input.species)) throw new BadRequestException('Проверьте специалиста, вид питомца, услугу и рабочее место');
      if (input.isActive && (!specialist.isActive || specialist.employee.status !== 'ACTIVE' || !service.isActive)) throw new BadRequestException('Для записи нужны действующие специалист и услуга');
      const { version, ...data } = input;
      if (id) {
        const changed = await tx.groomingServiceRule.updateMany({ where: { id, installationId: installation.id, version: version ?? -1 }, data: { ...data, version: { increment: 1 } } });
        if (!changed.count) throw new ConflictException('Правило изменилось. Обновите страницу');
      } else await tx.groomingServiceRule.create({ data: { ...data, installationId: installation.id } });
      await this.audit.log({ actorId: actor.id, action: 'grooming.rule.save', entityType: 'GroomingServiceRule', entityId: id || input.specialistId }, tx);
      return { ok: true };
    });
  }
  async bookings(actor: AuthEmployee, from?: string, to?: string) {
    if (!this.manager(actor) && !await this.prisma.groomingSpecialist.findUnique({ where: { employeeId: actor.id } })) throw new ForbiddenException('Профиль грумера не найден');
    return this.prisma.groomingReservation.findMany({ where: { ...this.scope(actor), ...(from || to ? { startsAt: { ...(from ? { gte: date(from) } : {}), ...(to ? { lt: date(to) } : {}) } } : {}) }, include: bookingInclude, orderBy: { startsAt: 'asc' }, take: 500 });
  }
  async booking(id: string, actor: AuthEmployee) {
    const found = await this.prisma.groomingReservation.findFirst({ where: { id, ...this.scope(actor) }, include: { ...bookingInclude, notifications: { orderBy: { createdAt: 'desc' }, take: 30 } } });
    if (!found) throw new NotFoundException('Запись не найдена');
    return found;
  }
  async clients(actor: AuthEmployee, search = '') {
    if (!this.manager(actor)) {
      const records = await this.prisma.groomingReservation.findMany({ where: { employeeId: actor.id }, select: { ownerId: true }, distinct: ['ownerId'], take: 200 });
      return this.prisma.owner.findMany({ where: { id: { in: records.map(r => r.ownerId) } }, select: { id: true, fullName: true, phone: true, animals: { where: { groomingReservations: { some: { employeeId: actor.id } } }, select: { id: true, nickname: true, species: true, breed: true } } } });
    }
    return this.prisma.owner.findMany({ where: search.trim() ? { OR: [{ fullName: { contains: search.trim(), mode: 'insensitive' } }, { phone: { contains: search.trim() } }] } : { groomingReservations: { some: {} } }, select: { id: true, fullName: true, phone: true, animals: { where: { archivedAt: null }, select: { id: true, nickname: true, species: true, breed: true } } }, take: 100, orderBy: { fullName: 'asc' } });
  }
  private async owner(ownerId: string, db: Prisma.TransactionClient = this.prisma) {
    const owner = await db.owner.findUnique({ where: { id: ownerId }, include: { portalAccess: true } });
    if (!owner || owner.portalAccess?.status === 'BLOCKED') throw new ForbiddenException('Кабинет недоступен. Свяжитесь с клиникой');
    return owner;
  }
  private async animal(ownerId: string, animalId: string, species: string, db: Prisma.TransactionClient = this.prisma) {
    const animal = await db.animal.findFirst({ where: { id: animalId, ownerId, archivedAt: null } });
    if (!animal) throw new BadRequestException('Выберите своего питомца');
    const known = /кош|кот|cat/i.test(animal.species || '') ? 'CAT' : /собак|dog/i.test(animal.species || '') ? 'DOG' : null;
    if (known && known !== species) throw new BadRequestException('Вид питомца не соответствует карточке');
    return animal;
  }
  async portalState(ownerId: string) {
    const owner = await this.owner(ownerId);
    const installation = await this.modules.installation('GROOMING'), settings = await this.settings();
    const enabled = installation.enabled && await this.modules.entitlement('GROOMING');
    const rules = enabled && settings.selfBookingEnabled ? (await this.prisma.groomingServiceRule.findMany({ where: { installationId: installation.id, isActive: true }, include: ruleInclude })).filter(usable) : [];
    const bookings = await this.prisma.groomingReservation.findMany({ where: { ownerId }, include: bookingInclude, orderBy: { startsAt: 'desc' }, take: 100 });
    const animals = await this.prisma.animal.findMany({ where: { ownerId, archivedAt: null }, select: { id: true, nickname: true, species: true, breed: true }, orderBy: { nickname: 'asc' } });
    return { enabled, selfBookingEnabled: enabled && settings.selfBookingEnabled, mode: process.env.GROOMING_QA_MODE === 'true' && process.env.NODE_ENV !== 'production' ? 'qa' : 'live', qaDelivery: process.env.GROOMING_QA_MODE === 'true' && process.env.NODE_ENV !== 'production' ? process.env.GROOMING_QA_DELIVERY || 'fake' : undefined, minimumCancelMinutes: settings.minimumCancelMinutes, owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone }, animals,
      services: [...new Map(rules.map(r => [r.serviceId, { id: r.serviceId, title: r.service.title, price: r.service.price, species: [...new Set(rules.filter(x => x.serviceId === r.serviceId).map(x => x.species))] }])).values()],
      specialists: [...new Map(rules.map(r => [r.specialistId, { id: r.specialistId, displayName: r.specialist.displayName, species: r.specialist.species }])).values()],
      bookings: bookings.map(publicBooking) };
  }
  async options(ownerId: string, input: GroomingOptionsDto, now = new Date(), actor?: AuthEmployee) {
    await this.owner(ownerId); await this.animal(ownerId, input.animalId, input.species);
    await this.writable(undefined, !actor);
    if (actor && !this.manager(actor)) throw new ForbiddenException('Создавать записи может администратор');
    if (input.species === 'DOG' && input.size === 'ANY') throw new BadRequestException('Укажите размер собаки');
    if (input.reservationId) await this.editable(input.reservationId, ownerId, actor);
    const center = date(`${input.date}T12:00:00Z`);
    if (Math.abs(center.getTime() - now.getTime()) > 92 * day) throw new BadRequestException('Выберите дату в ближайшие 90 дней');
    const rules = (await this.prisma.groomingServiceRule.findMany({ where: { isActive: true, serviceId: input.serviceId, species: input.species, size: { in: ['ANY', input.size] }, coat: { in: ['ANY', input.coat] }, ...(input.specialistId ? { specialistId: input.specialistId } : {}) }, include: ruleInclude })).filter(usable);
    const offers: Array<Record<string, unknown>> = [];
    for (const rule of rules) {
      const from = new Date(Math.max(center.getTime() - 26 * 3600000, now.getTime() + (actor ? 0 : rule.minimumLeadMinutes * minute))), to = new Date(Math.min(center.getTime() + 26 * 3600000, now.getTime() + rule.maximumDaysAhead * day));
      if (from >= to) continue;
      const shifts = await this.prisma.groomingWorkPeriod.findMany({ where: { specialistId: rule.specialistId, locationId: rule.locationId, kind: 'WORK', isActive: true, startsAt: { lt: to }, endsAt: { gt: from } } });
      for (const shift of shifts) {
        const start = Math.max(shift.startsAt.getTime(), from.getTime());
        const step = rule.stepMinutes * minute;
        for (let time = shift.startsAt.getTime() + Math.ceil((start - shift.startsAt.getTime()) / step) * step; time + (rule.durationMinutes + rule.bufferMinutes) * minute <= Math.min(shift.endsAt.getTime(), to.getTime()); time += step) {
          const begins = new Date(time), end = new Date(time + rule.durationMinutes * minute), blocked = new Date(end.getTime() + rule.bufferMinutes * minute);
          if (localDay(begins, rule.location.timezone) !== input.date) continue;
          if (await this.conflict(this.prisma, rule.specialist.employeeId, rule.workplaceId, begins, blocked, input.reservationId)) continue;
          const offer: Offer = { ownerId, animalId: input.animalId, ruleId: rule.id, ruleVersion: rule.version, serviceVersion: rule.service.updatedAt.toISOString(), startsAt: begins.toISOString(), expiresAt: new Date(now.getTime() + 5 * minute).toISOString(), species: input.species, size: input.size, coat: input.coat, ignoreId: input.reservationId, staff: Boolean(actor) };
          offers.push({ offerToken: this.sign(offer), startsAt: begins.toISOString(), endsAt: end.toISOString(), blockedUntil: blocked.toISOString(), expiresAt: offer.expiresAt, specialistId: rule.specialistId, specialistName: rule.specialist.displayName, serviceTitle: rule.service.title, price: rule.service.price, durationMinutes: rule.durationMinutes, bufferMinutes: rule.bufferMinutes, timezone: rule.location.timezone, locationName: rule.location.name });
          if (offers.length >= 160) break;
        }
      }
    }
    return { date: input.date, offers: offers.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))).slice(0, 160), notice: 'Время повторно проверяется при подтверждении. Выбор интервала пока не создаёт бронь.' };
  }
  private async conflict(db: Prisma.TransactionClient, employeeId: string, workplaceId: string, startsAt: Date, blockedUntil: Date, ignoreId?: string) {
    const block = await db.groomingWorkPeriod.findFirst({ where: { specialist: { employeeId }, kind: 'BLOCK', isActive: true, startsAt: { lt: blockedUntil }, endsAt: { gt: startsAt } }, select: { id: true } });
    if (block) return true;
    return Boolean(await db.groomingReservation.findFirst({ where: { ...(ignoreId ? { id: { not: ignoreId } } : {}), status: { in: activeGroomingStatuses }, AND: [{ OR: [{ employeeId }, { workplaceId }] }], startsAt: { lt: blockedUntil }, blockedUntil: { gt: startsAt } }, select: { id: true } }));
  }
  private async editable(id: string, ownerId: string, actor?: AuthEmployee, db: Prisma.TransactionClient = this.prisma) {
    const booking = await db.groomingReservation.findFirst({ where: { id, ...(actor ? this.scope(actor) : { ownerId }) }, include: bookingInclude });
    if (!booking) throw new NotFoundException('Запись не найдена');
    return booking;
  }
  async book(ownerId: string, input: GroomingBookDto, now = new Date(), actor?: AuthEmployee, reschedule?: { id: string; version: number }) {
    if (!input.contactConsent || !input.bookingConsent) throw new BadRequestException('Подтвердите запись и разрешение на связь');
    const fingerprint = digest({ ownerId, input, actorId: actor?.id, reschedule });
    const receiptId = `grooming:${actor ? `staff:${actor.id}` : `owner:${ownerId}`}:${input.clientKey}`;
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const previous = await tx.groomingCommandReceipt.findUnique({ where: { id: receiptId } });
      if (previous) { if (previous.fingerprint !== fingerprint) throw new ConflictException('Ключ записи уже использован с другими данными'); return previous.result; }
      await this.writable(tx, !actor);
      if (actor && !this.manager(actor)) throw new ForbiddenException('Создавать и переносить записи может администратор');
      const offer = this.verify(input.offerToken);
      if (offer.ownerId !== ownerId || offer.staff !== Boolean(actor) || (offer.ignoreId || undefined) !== reschedule?.id || date(offer.expiresAt) <= now) throw new ConflictException('Предложение истекло. Обновите свободное время');
      await this.owner(ownerId, tx); await this.animal(ownerId, offer.animalId, offer.species, tx);
      const rule = await tx.groomingServiceRule.findUnique({ where: { id: offer.ruleId }, include: ruleInclude });
      if (!rule || !usable(rule) || rule.version !== offer.ruleVersion || rule.service.updatedAt.toISOString() !== offer.serviceVersion) throw new ConflictException('Условия услуги изменились. Обновите свободное время');
      const startsAt = date(offer.startsAt), endsAt = new Date(startsAt.getTime() + rule.durationMinutes * minute), blockedUntil = new Date(endsAt.getTime() + rule.bufferMinutes * minute);
      if (startsAt.getTime() < now.getTime() + (actor ? 0 : rule.minimumLeadMinutes * minute) || startsAt.getTime() > now.getTime() + rule.maximumDaysAhead * day) throw new ConflictException('Это время больше недоступно');
      const shift = await tx.groomingWorkPeriod.findFirst({ where: { specialistId: rule.specialistId, locationId: rule.locationId, kind: 'WORK', isActive: true, startsAt: { lte: startsAt }, endsAt: { gte: blockedUntil } } });
      if (!shift || await this.conflict(tx, rule.specialist.employeeId, rule.workplaceId, startsAt, blockedUntil, reschedule?.id)) throw new ConflictException('Время уже занято. Выберите другой интервал');
      let current: Booking | undefined;
      if (reschedule) {
        current = await this.editable(reschedule.id, ownerId, actor, tx);
        if (current.version !== reschedule.version || current.status !== 'CONFIRMED') throw new ConflictException('Запись уже изменилась. Обновите кабинет');
        if (!actor) await this.checkCancelWindow(current, now, tx);
        if (current.animalId !== offer.animalId) throw new BadRequestException('При переносе питомец сохраняется');
        await tx.groomingNotification.updateMany({ where: { reservationId: current.id, status: { in: ['QUEUED', 'FAILED'] } }, data: { status: 'CANCELLED', lastError: 'Запись перенесена' } });
      }
      const data = { installationId: rule.installationId, ruleId: rule.id, ownerId, animalId: offer.animalId, employeeId: rule.specialist.employeeId, locationId: rule.locationId, workplaceId: rule.workplaceId, serviceTitle: rule.service.title, price: rule.service.price, species: offer.species, size: offer.size, coat: offer.coat, startsAt, endsAt, blockedUntil, notes: input.notes?.trim() || '', looks: json(input.looks || []), source: actor ? 'CRM' : 'CLIENT_PORTAL' };
      const saved = current ? await tx.groomingReservation.update({ where: { id: current.id }, data: { ...data, version: { increment: 1 } }, include: bookingInclude }) : await tx.groomingReservation.create({ data, include: bookingInclude });
      await this.queueNotifications(tx, saved, current ? 'RESCHEDULED' : 'CONFIRMED', now, current?.employeeId);
      await this.audit.log({ actorId: actor?.id, action: current ? 'grooming.reschedule' : 'grooming.book', entityType: 'GroomingReservation', entityId: saved.id, metadata: { ownerId, animalId: saved.animalId, source: saved.source, contactConsent: true, bookingConsent: true } }, tx);
      const result = json(publicBooking(saved));
      await tx.groomingCommandReceipt.create({ data: { id: receiptId, fingerprint, result } });
      return result;
    }, { timeout: 15000 });
  }
  private async checkCancelWindow(booking: Booking, now: Date, tx: Prisma.TransactionClient) {
    const settings = await tx.groomingSettings.findUnique({ where: { installationId: booking.installationId } });
    if (booking.startsAt.getTime() - now.getTime() < (settings?.minimumCancelMinutes ?? 120) * minute) throw new ConflictException('До визита осталось мало времени. Свяжитесь с администратором');
  }
  async status(id: string, ownerId: string, input: GroomingCancelDto & { status?: string }, now = new Date(), actor?: AuthEmployee) {
    const receiptId = `grooming:${actor ? `staff:${actor.id}` : `owner:${ownerId}`}:${input.clientKey}`, fingerprint = digest({ id, ownerId, input, actorId: actor?.id });
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const receipt = await tx.groomingCommandReceipt.findUnique({ where: { id: receiptId } });
      if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ConflictException('Ключ действия уже использован'); return receipt.result; }
      if (!actor) await this.owner(ownerId, tx);
      const booking = await this.editable(id, ownerId, actor, tx), status = actor ? input.status || 'CANCELLED' : 'CANCELLED';
      if (booking.version !== input.version) throw new ConflictException('Запись уже изменилась. Обновите страницу');
      const transitions: Record<string, string[]> = { CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'], ARRIVED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED'] };
      if (!transitions[booking.status]?.includes(status)) throw new ConflictException('Этот статус больше нельзя установить');
      if (!actor) { if (booking.status !== 'CONFIRMED') throw new ConflictException('Отмена через кабинет недоступна'); await this.checkCancelWindow(booking, now, tx); }
      if (['COMPLETED', 'NO_SHOW'].includes(status) && booking.startsAt > now) throw new ConflictException('Визит ещё не начался');
      const saved = await tx.groomingReservation.update({ where: { id }, data: { status, version: { increment: 1 } }, include: bookingInclude });
      await tx.groomingNotification.updateMany({ where: { reservationId: id, status: { in: ['QUEUED', 'FAILED'] } }, data: { status: 'CANCELLED', lastError: 'Статус записи изменился' } });
      if (status === 'CANCELLED') await this.queueNotifications(tx, saved, 'CANCELLED', now);
      else await supersedeGroomingStaffNotices(tx, id, now);
      await this.audit.log({ actorId: actor?.id, action: 'grooming.status', entityType: 'GroomingReservation', entityId: id, metadata: { status } }, tx);
      const result = json(publicBooking(saved)); await tx.groomingCommandReceipt.create({ data: { id: receiptId, fingerprint, result } }); return result;
    });
  }
  async createPet(ownerId: string, input: GroomingPetDto) {
    await this.owner(ownerId);
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const id = `grooming:pet:${ownerId}:${input.clientKey}`, fingerprint = digest(input), previous = await tx.groomingCommandReceipt.findUnique({ where: { id } });
      if (previous) { if (previous.fingerprint !== fingerprint) throw new ConflictException('Ключ питомца уже использован'); return previous.result; }
      await this.owner(ownerId, tx); await this.writable(tx, true);
      const animal = await tx.animal.create({ data: { ownerId, nickname: input.nickname.trim(), species: input.species === 'CAT' ? 'Кошка' : 'Собака', breed: input.breed?.trim() || null }, select: { id: true, nickname: true, species: true, breed: true } });
      await this.audit.log({ action: 'grooming.pet.create', entityType: 'Animal', entityId: animal.id, metadata: { ownerId } }, tx);
      await tx.groomingCommandReceipt.create({ data: { id, fingerprint, result: json(animal) } }); return animal;
    });
  }
  async register(registrationId: string, maxUserId: string, input: { knownOwnerId?: string; fullName?: string; phone?: string }) {
    if (!/^\d{1,24}$/.test(maxUserId)) throw new BadRequestException('MAX не подтверждён');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const receiptId = `grooming:register:${registrationId}`, fingerprint = digest({ maxUserId, input });
      const receipt = await tx.groomingCommandReceipt.findUnique({ where: { id: receiptId } });
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new ConflictException('Регистрация уже обработана');
        await this.owner((receipt.result as { ownerId: string }).ownerId, tx); return receipt.result;
      }
      let owner = input.knownOwnerId ? await this.owner(input.knownOwnerId, tx) : null;
      if (!owner) {
        const linked = await tx.owner.findMany({ where: { maxUserId }, include: { portalAccess: true }, take: 2 });
        if (linked.length > 1) return { status: 'REVIEW_REQUIRED', message: 'Для привязки кабинета свяжитесь с клиникой' };
        owner = linked[0] || null;
        if (owner?.portalAccess?.status === 'BLOCKED') throw new ForbiddenException('Кабинет недоступен. Свяжитесь с клиникой');
      }
      if (!owner) {
        await this.writable(tx, true);
        const phone = normalizePhoneForLookup(input.phone || '');
        if (!input.fullName?.trim() || input.fullName.trim().length < 2 || !phone) return { status: 'NEEDS_DETAILS' };
        // A phone is contact data, never evidence of ownership of an existing record.
        const samePhone = await tx.owner.findFirst({ where: { OR: [{ phoneNormalized: phone }, { phone: { in: [input.phone || '', `+${phone}`, phone] } }] }, select: { id: true } });
        if (samePhone) return { status: 'REVIEW_REQUIRED', message: 'Для безопасной привязки существующего кабинета свяжитесь с клиникой' };
        owner = await tx.owner.create({ data: { fullName: input.fullName.trim(), phone: `+${phone}`, phoneNormalized: phone, source: 'GROOMING_MAX', maxUserId, allowMax: true, preferredNotificationChannel: 'MESSENGER' }, include: { portalAccess: true } });
        await this.audit.log({ action: 'grooming.owner.register', entityType: 'Owner', entityId: owner.id, metadata: { verifiedChannel: 'MAX' } }, tx);
      }
      await tx.clientPortalAccess.upsert({ where: { ownerId: owner.id }, create: { ownerId: owner.id, status: 'ENABLED' }, update: {} });
      const animals = await tx.animal.findMany({ where: { ownerId: owner.id, archivedAt: null }, select: { id: true, nickname: true, species: true, breed: true } });
      const result = json({ status: 'READY', ownerId: owner.id, displayName: owner.fullName, owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone }, animals });
      await tx.groomingCommandReceipt.create({ data: { id: receiptId, fingerprint, result } }); return result;
    });
  }
  private async queueNotifications(tx: Prisma.TransactionClient, booking: Booking, event: string, now: Date, previousEmployeeId?: string) {
    await queueGroomingStaffNotices(tx, booking, event, now, previousEmployeeId);
    const settings = await tx.groomingSettings.findUnique({ where: { installationId: booking.installationId } });
    const specialist = await tx.groomingSpecialist.findUnique({ where: { employeeId: booking.employeeId } });
    const when = new Intl.DateTimeFormat('ru-RU', { timeZone: booking.location.timezone, dateStyle: 'long', timeStyle: 'short' }).format(booking.startsAt);
    const text = `TemichevVet · Груминг: ${event === 'CANCELLED' ? 'запись отменена' : event === 'RESCHEDULED' ? 'запись перенесена' : 'запись подтверждена'}. ${booking.animal.nickname}, ${booking.serviceTitle}, ${when}. Специалист: ${specialist?.displayName || booking.employee.fullName}. Подробности в кабинете.`.slice(0, 800);
    const expiresAt = event === 'CANCELLED' ? new Date(now.getTime() + day) : booking.startsAt;
    const recipients = [{ kind: 'OWNER', id: booking.ownerId }, ...[...new Set([...(settings?.administratorMaxIds || []), ...(specialist?.maxUserId ? [specialist.maxUserId] : [])])].map(id => ({ kind: 'STAFF', id }))];
    for (const recipient of recipients) await tx.groomingNotification.create({ data: { reservationId: booking.id, reservationVersion: booking.version, event, recipientKind: recipient.kind, recipientId: recipient.id, dedupeKey: `${booking.id}:${booking.version}:${event}:${recipient.kind}:${recipient.id}`, text, scheduledAt: now, expiresAt } });
    if (event === 'CANCELLED') return;
    for (const hours of settings?.reminderHours || [24]) {
      const scheduledAt = new Date(booking.startsAt.getTime() - hours * 3600000);
      if (scheduledAt.getTime() <= now.getTime() + 5 * minute) continue;
      await tx.groomingNotification.create({ data: { reservationId: booking.id, reservationVersion: booking.version, event: 'REMINDER', recipientKind: 'OWNER', recipientId: booking.ownerId, dedupeKey: `${booking.id}:${booking.version}:REMINDER:${hours}:${booking.ownerId}`, text: `TemichevVet · Груминг: напоминаем о записи. ${booking.animal.nickname}, ${when}. Специалист: ${specialist?.displayName || booking.employee.fullName}. Подробности в кабинете.`.slice(0, 800), scheduledAt, expiresAt: booking.startsAt } });
    }
  }
  private secret() { const value = process.env.GROOMING_BOOKING_SIGNING_SECRET?.trim() || process.env.OWNER_GATEWAY_SYNC_SECRET?.trim(); if (!value || value.length < 24) throw new ServiceUnavailableException('Подписание записи не настроено'); return value; }
  private sign(offer: Offer) { const body = Buffer.from(JSON.stringify(offer)).toString('base64url'); return `${body}.${createHmac('sha256', this.secret()).update(body).digest('base64url')}`; }
  private verify(token: string): Offer {
    try { const [body, signature, extra] = token.split('.'); const expected = createHmac('sha256', this.secret()).update(body).digest(); const received = Buffer.from(signature, 'base64url'); if (extra || received.length !== expected.length || !timingSafeEqual(received, expected)) throw Error(); const value = JSON.parse(Buffer.from(body, 'base64url').toString()) as Offer; if (!value.ruleId || !value.ownerId || !value.animalId || !value.expiresAt) throw Error(); return value; } catch { throw new ConflictException('Предложение недействительно. Обновите свободное время'); }
  }
}
function usable(rule: Rule) { return rule.isActive && rule.specialist.isActive && rule.specialist.employee.status === 'ACTIVE' && rule.service.isActive && rule.location.isActive && rule.workplace.isActive && rule.specialist.species.includes(rule.species); }
function date(value: string) { const result = new Date(value); if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(result.getTime())) throw new BadRequestException('Укажите дату с часовым поясом'); return result; }
function localDay(value: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value); }
function publicBooking(booking: Booking) { const { owner, rule, ...rest } = booking; return { ...rest, serviceId: rule.serviceId, price: booking.price.toString() }; }
