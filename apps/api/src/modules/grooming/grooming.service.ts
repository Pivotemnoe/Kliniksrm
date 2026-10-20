import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { groomingPriceEntries, groomingPriceLabel, groomingServiceBookable, groomingPriceCatalogVersion } from './price-catalog';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { ClinicModulesService } from '../clinic-modules/clinic-modules.service';
import { normalizePhoneForLookup } from '../../common/phone';
import { queueGroomingStaffNotices, supersedeGroomingStaffNotices } from './grooming-staff-notifications.service';
import { GroomingPriceImportDto, GroomingScheduleBatchDto, GroomingRulesBatchDto, GroomingBookDto, GroomingCancelDto, GroomingChangeDto, GroomingLocationDto, GroomingOptionsDto, GroomingPetDto, GroomingRuleDto, GroomingServiceDto, GroomingSettingsDto, GroomingSpecialistDto, GroomingStatusDto, GroomingWorkPeriodDto, GroomingWorkplaceDto } from './grooming.dto';

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
    if (installation.enabled && entitled && actor.permissions.includes('grooming.manage') && await this.prisma.groomingService.count({ where: { installationId: installation.id, catalogKey: { not: null } } }) < groomingPriceEntries().length) await this.importPrices({ clientKey: 'initial-catalog-' + groomingPriceCatalogVersion }, actor);
    const specialists = await this.prisma.groomingSpecialist.findMany({ where: { installationId: installation.id, ...(this.manager(actor) ? {} : { employeeId: actor.id }) }, include: { employee: { select: { id: true, fullName: true, status: true, accountScope: true } } }, orderBy: { displayName: 'asc' } });
    const rules = await this.prisma.groomingServiceRule.findMany({ where: { installationId: installation.id, ...(this.manager(actor) ? {} : { specialist: { employeeId: actor.id } }) }, include: ruleInclude, orderBy: { createdAt: 'asc' } });
    const canManage = actor.permissions.includes('grooming.manage'), canSchedule = canManage || actor.permissions.includes('grooming.schedule');
    const resources = canManage || canSchedule ? {
      employees: specialists.map(s => ({ id: s.employeeId, fullName: s.displayName })),
      locations: await this.prisma.groomingLocation.findMany({ where: { installationId: installation.id }, orderBy: { name: 'asc' } }),
      workplaces: await this.prisma.groomingWorkplace.findMany({ where: { location: { installationId: installation.id } }, orderBy: { name: 'asc' } }),
      services: await this.prisma.groomingService.findMany({ where: { installationId: installation.id }, orderBy: { title: 'asc' } }),
    } : null;
    return { installation, entitled, settings: canManage ? settings : { selfBookingEnabled: settings.selfBookingEnabled }, specialists: specialists.map(s => canManage ? { ...s, maxConnected: Boolean(s.maxUserId) } : { ...s, maxConnected: Boolean(s.maxUserId), maxUserId: undefined }), rules, resources, setup: canManage ? { connectedPhones: await this.prisma.remoteAccessDevice.count({ where: { employeeId: { in: specialists.filter(s => s.employee.accountScope === 'GROOMING').map(s => s.employeeId) }, revokedAt: null } }), futureWorkPeriods: await this.prisma.groomingWorkPeriod.count({ where: { specialistId: { in: specialists.map(s => s.id) }, isActive: true, kind: 'WORK', endsAt: { gt: new Date() } } }) } : undefined, canManage, canSchedule, limited: !installation.enabled || !entitled };
  }
  async saveSettings(input: GroomingSettingsDto, actor: AuthEmployee) {
    const previous = await this.settings();
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const { version, ...fields } = input;
      const data = { ...fields, ...(fields.testClientMaxId === undefined ? {} : { testClientMaxId: fields.testClientMaxId || null }) };
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
      if (await tx.groomingWorkplace.findFirst({ where: { locationId: location.id, name: { equals: input.name.trim(), mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) } })) throw new ConflictException('Рабочее место с таким названием уже есть');
      let result;
      if (id) { const changed = await tx.groomingWorkplace.updateMany({ where: { id, location: { installationId: installation.id }, version: version ?? -1 }, data: { ...data, version: { increment: 1 } } }); if (!changed.count) throw new ConflictException('Рабочее место уже изменилось'); result = await tx.groomingWorkplace.findUniqueOrThrow({ where: { id } }); }
      else result = await tx.groomingWorkplace.create({ data });
      await this.audit.log({ actorId: actor.id, action: 'grooming.workplace.save', entityType: 'GroomingWorkplace', entityId: result.id }, tx); return result;
    });
  }
  async saveService(input: GroomingServiceDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const previous = id ? await tx.groomingService.findFirst({ where: { id, installationId: installation.id } }) : null;
      if (id && (!previous || previous.version !== input.version)) throw new ConflictException('Услуга уже изменилась');
      const type = input.priceType || previous?.priceType || 'FIXED';
      const maximumPrice = input.maximumPrice === undefined ? previous?.maximumPrice : input.maximumPrice;
      if (['RANGE', 'UP_TO'].includes(type) && (maximumPrice == null || Number(maximumPrice) <= 0 || (type === 'RANGE' && Number(maximumPrice) < input.price))) throw new BadRequestException('Укажите корректную верхнюю границу цены');
      const data = { title: input.title.trim(), price: type === 'UP_TO' || type === 'QUOTE' ? 0 : input.price, priceType: type, maximumPrice: ['RANGE', 'UP_TO'].includes(type) ? maximumPrice : null, isActive: input.isActive ?? previous?.isActive ?? true };
      const result = id ? await tx.groomingService.update({ where: { id }, data: { ...data, version: { increment: 1 } } }) : await tx.groomingService.create({ data: { ...data, installationId: installation.id } });
      await this.audit.log({ actorId: actor.id, action: 'grooming.service.save', entityType: 'GroomingService', entityId: result.id }, tx); return result;
    });
  }
  async importPrices(input: GroomingPriceImportDto, actor: AuthEmployee) {
    const installation = await this.modules.installation('GROOMING');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const receiptId = `grooming:price-import:${actor.id}:${input.clientKey}`;
      const fingerprint = digest({ version: groomingPriceCatalogVersion });
      const prior = await tx.groomingCommandReceipt.findUnique({ where: { id: receiptId } });
      if (prior) return prior.result;
      let created = 0, preserved = 0;
      for (const entry of groomingPriceEntries()) {
        const previous = await tx.groomingService.findUnique({ where: { installationId_catalogKey: { installationId: installation.id, catalogKey: entry.catalogKey } } });
        if (previous) { preserved++; continue; }
        await tx.groomingService.create({ data: { ...entry, catalogData: json(entry.catalogData), installationId: installation.id } }); created++;
      }
      const result = { created, preserved, catalogVersion: groomingPriceCatalogVersion, note: 'Цены перенесены без повторной наценки. Для записи задайте длительность, специалиста и смены.' };
      await this.audit.log({ actorId: actor.id, action: 'grooming.prices.import', entityType: 'GroomingSettings', entityId: installation.id, metadata: result }, tx);
      await tx.groomingCommandReceipt.create({ data: { id: receiptId, fingerprint, result } }); return result;
    }, { timeout: 30000 });
  }
  async batchShifts(input: GroomingScheduleBatchDto, actor: AuthEmployee, preview = false) {
    const installation = await this.modules.installation('GROOMING');
    const from = date(`${input.from}T00:00:00+03:00`), to = date(`${input.to}T00:00:00+03:00`);
    if (localDay(from, 'Europe/Moscow') !== input.from || localDay(to, 'Europe/Moscow') !== input.to || to < from || to.getTime() - from.getTime() > 61 * day || input.startsTime >= input.endsTime) throw new BadRequestException('Выберите период до 62 дней и окончание после начала смены');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const receiptId = `grooming:schedule:${actor.id}:${input.clientKey}`, fingerprint = digest(input);
      const receipt = await tx.groomingCommandReceipt.findUnique({ where: { id: receiptId } });
      if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ConflictException('Ключ расписания уже использован'); return receipt.result; }
      const location = await tx.groomingLocation.findFirst({ where: { id: input.locationId, installationId: installation.id, isActive: true } });
      if (!location || location.timezone !== 'Europe/Moscow') throw new BadRequestException('Выберите действующее место с часовым поясом Europe/Moscow');
      if (input.workplaceId && !await tx.groomingWorkplace.findFirst({ where: { id: input.workplaceId, locationId: location.id, isActive: true } })) throw new BadRequestException('Выберите рабочее место студии');
      const ids = [...new Set(input.employeeIds)];
      if (input.workplaceId && ids.length > 1) throw new BadRequestException('Назначьте каждому грумеру своё рабочее место и график');
      const specialists = await tx.groomingSpecialist.findMany({ where: { installationId: installation.id, employeeId: { in: ids }, isActive: true, employee: { status: 'ACTIVE' } } });
      if (specialists.length !== ids.length) throw new BadRequestException('Выберите действующих грумеров');
      const tableShifts = input.workplaceId ? await tx.groomingWorkPeriod.findMany({ where: { workplaceId: input.workplaceId, isActive: true, kind: 'WORK', startsAt: { lt: new Date(to.getTime() + day) }, endsAt: { gt: from } } }) : [];
      const existing = await tx.groomingWorkPeriod.findMany({ where: { specialistId: { in: specialists.map(s => s.id) }, isActive: true, kind: 'WORK', startsAt: { lt: new Date(to.getTime() + day) }, endsAt: { gt: from } } });
      const planned: Array<{ specialistId: string; locationId: string; workplaceId?: string; startsAt: Date; endsAt: Date; comment: string }> = [], conflicts: string[] = []; let skipped = 0;
      for (let d = from.getTime(); d <= to.getTime(); d += day) {
        const value = localDay(new Date(d + 12 * 3600000), 'Europe/Moscow'), weekday = new Date(d + 12 * 3600000).getUTCDay();
        if (!input.weekdays.includes(weekday) || input.excludedDates?.includes(value)) continue;
        for (const specialist of specialists) {
          const startsAt = date(`${value}T${input.startsTime}:00+03:00`), endsAt = date(`${value}T${input.endsTime}:00+03:00`);
          const overlaps = existing.filter(p => p.specialistId === specialist.id && p.startsAt < endsAt && p.endsAt > startsAt);
          if (overlaps.length === 1 && overlaps[0].locationId === location.id && (overlaps[0].workplaceId || undefined) === input.workplaceId && +overlaps[0].startsAt === +startsAt && +overlaps[0].endsAt === +endsAt) { skipped++; continue; }
          if (overlaps.length || tableShifts.some(p => p.specialistId !== specialist.id && p.startsAt < endsAt && p.endsAt > startsAt)) { conflicts.push(`${specialist.displayName}: ${value}`); continue; }
          planned.push({ specialistId: specialist.id, locationId: location.id, workplaceId: input.workplaceId, startsAt, endsAt, comment: input.comment });
        }
      }
      const result = { created: planned.length, skipped, conflicts, preview, dates: [...new Set(planned.map(p => localDay(p.startsAt, 'Europe/Moscow')))] };
      if (preview) return result;
      if (conflicts.length) throw new ConflictException(`Есть пересечения смен: ${conflicts.slice(0, 5).join('; ')}. Ничего не добавлено.`);
      if (planned.length) await tx.groomingWorkPeriod.createMany({ data: planned });
      await this.audit.log({ actorId: actor.id, action: 'grooming.schedule.batch', entityType: 'GroomingSettings', entityId: installation.id, metadata: json(result) }, tx);
      await tx.groomingCommandReceipt.create({ data: { id: receiptId, fingerprint, result: json(result) } }); return result;
    }, { timeout: 30000 });
  }
  async storefrontSnapshot(now = new Date()) {
    const installation = await this.modules.installation('GROOMING'), settings = await this.settings();
    const entitled = await this.modules.entitlement('GROOMING');
    const rules = (await this.prisma.groomingServiceRule.findMany({ where: { installationId: installation.id, isActive: true }, include: ruleInclude })).filter(usable);
    const horizon = new Date(now.getTime() + 91 * day);
    const shifts = await this.prisma.groomingWorkPeriod.findMany({ where: { specialist: { installationId: installation.id }, isActive: true, startsAt: { lt: horizon }, endsAt: { gt: now } }, take: 5001 });
    const busy = await this.prisma.groomingReservation.findMany({ where: { installationId: installation.id, status: { in: activeGroomingStatuses }, startsAt: { lt: horizon }, blockedUntil: { gt: now } }, select: { employeeId: true, workplaceId: true, startsAt: true, blockedUntil: true }, take: 5001 });
    const services = await this.prisma.groomingService.findMany({ where: { installationId: installation.id, isActive: true }, orderBy: { title: 'asc' } });
    return { schemaVersion: 1, capturedAt: now.toISOString(), testMode: Boolean(settings.testClientMaxId), enabled: installation.enabled && entitled, selfBookingEnabled: installation.enabled && entitled && settings.selfBookingEnabled && shifts.length <= 5000 && busy.length <= 5000,
      services: services.map(s => ({ id: s.id, title: s.title, price: String(s.price), priceType: s.priceType, maximumPrice: s.maximumPrice == null ? null : String(s.maximumPrice), priceLabel: groomingPriceLabel(s), catalogKey: s.catalogKey, catalogData: s.catalogData, bookable: groomingServiceBookable(s) && rules.some(r => r.serviceId === s.id), version: s.version })),
      specialists: [...new Map(rules.map(r => [r.specialistId, { id: r.specialistId, employeeId: r.specialist.employeeId, displayName: r.specialist.displayName, species: r.specialist.species }])).values()],
      rules: rules.map(r => ({ id: r.id, specialistId: r.specialistId, employeeId: r.specialist.employeeId, serviceId: r.serviceId, locationId: r.locationId, workplaceId: r.workplaceId, species: r.species, size: r.size, coat: r.coat, durationMinutes: r.durationMinutes, bufferMinutes: r.bufferMinutes, stepMinutes: r.stepMinutes, minimumLeadMinutes: r.minimumLeadMinutes, maximumDaysAhead: r.maximumDaysAhead, timezone: r.location.timezone, locationName: r.location.name })),
      shifts: shifts.map(s => ({ specialistId: s.specialistId, locationId: s.locationId, kind: s.kind, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
      busy: busy.map(b => ({ employeeId: b.employeeId, workplaceId: b.workplaceId, startsAt: b.startsAt.toISOString(), endsAt: b.blockedUntil.toISOString() })) };
  }
  async shifts(actor: AuthEmployee, from?: string, to?: string) {
    const overview = await this.overview(actor);
    return (await this.prisma.groomingWorkPeriod.findMany({ where: { specialistId: { in: overview.specialists.map(s => s.id) }, ...(from || to ? { startsAt: { ...(to ? { lt: date(to) } : {}) }, endsAt: { ...(from ? { gt: date(from) } : {}) } } : {}) }, include: { specialist: { include: { employee: { select: { id: true, fullName: true } } } }, location: { select: { id: true, name: true } }, workplace: { select: { id: true, name: true } } }, orderBy: { startsAt: 'asc' }, take: from && to ? 5000 : 500 })).map(p => ({ ...p, employeeId: p.specialist.employeeId, employee: p.specialist.employee }));
  }
  async saveShift(input: GroomingWorkPeriodDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    const startsAt = date(input.startsAt), endsAt = date(input.endsAt);
    if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > (input.kind === 'WORK' ? 24 * 3600000 : 90 * day)) throw new BadRequestException('Проверьте начало и окончание интервала');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const specialist = await tx.groomingSpecialist.findFirst({ where: { employeeId: input.employeeId, installationId: installation.id } });
      const location = await tx.groomingLocation.findFirst({ where: { id: input.locationId, installationId: installation.id } });
      if (!specialist || !location) throw new BadRequestException('Выберите грумера и студию');
      const workplace = input.workplaceId ? await tx.groomingWorkplace.findFirst({ where: { id: input.workplaceId, locationId: location.id, isActive: true } }) : null;
      if (input.workplaceId && !workplace) throw new BadRequestException('Выберите рабочее место выбранной студии');
      if (input.isActive && input.kind === 'WORK' && input.workplaceId && await tx.groomingWorkPeriod.findFirst({ where: { ...(id ? { id: { not: id } } : {}), workplaceId: input.workplaceId, kind: 'WORK', isActive: true, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })) throw new ConflictException('Рабочее место уже назначено грумеру на это время');
      const previous = id ? await tx.groomingWorkPeriod.findFirst({ where: { id, specialist: { installationId: installation.id } } }) : null;
      if (id && (!previous || previous.version !== input.version || previous.specialistId !== specialist.id)) throw new ConflictException('Интервал уже изменился. Обновите страницу');
      if (input.isActive && input.kind === 'WORK' && await tx.groomingWorkPeriod.findFirst({ where: { ...(id ? { id: { not: id } } : {}), specialistId: specialist.id, kind: 'WORK', isActive: true, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })) throw new ConflictException('У специалиста уже есть смена в это время');
      const future = await tx.groomingReservation.findMany({ where: { employeeId: specialist.employeeId, status: { in: activeGroomingStatuses }, startsAt: { gt: new Date() } } });
      for (const booking of future) {
        if (input.isActive && input.kind === 'BLOCK' && startsAt < booking.blockedUntil && endsAt > booking.startsAt) throw new ConflictException('В этом интервале есть запись. Сначала перенесите её');
        if (previous?.kind === 'WORK' && previous.startsAt <= booking.startsAt && previous.endsAt >= booking.blockedUntil && previous.locationId === booking.locationId) {
          const covered = input.isActive && input.kind === 'WORK' && input.locationId === booking.locationId && (!input.workplaceId || input.workplaceId === booking.workplaceId) && startsAt <= booking.startsAt && endsAt >= booking.blockedUntil || Boolean(await tx.groomingWorkPeriod.findFirst({ where: { id: { not: id }, specialistId: specialist.id, locationId: booking.locationId, OR: [{ workplaceId: null }, { workplaceId: booking.workplaceId }], kind: 'WORK', isActive: true, startsAt: { lte: booking.startsAt }, endsAt: { gte: booking.blockedUntil } } }));
          if (!covered) throw new ConflictException('Смена содержит будущую запись. Сначала перенесите её');
        }
      }
      const { employeeId, version, ...rest } = input, data = { ...rest, specialistId: specialist.id, startsAt, endsAt };
      const saved = id ? await tx.groomingWorkPeriod.update({ where: { id }, data: { ...data, version: { increment: 1 } } }) : await tx.groomingWorkPeriod.create({ data });
      await this.audit.log({ actorId: actor.id, action: 'grooming.work_period.save', entityType: 'GroomingWorkPeriod', entityId: saved.id }, tx); return saved;
    });
  }
  async saveSpecialist(input: GroomingSpecialistDto, actor: AuthEmployee, id?: string) {
    if (!id) throw new BadRequestException('Создайте грумера внутри модуля');
    const installation = await this.modules.installation('GROOMING');
    const profile = await this.prisma.groomingSpecialist.findFirst({ where: { id, installationId: installation.id } });
    if (!profile || input.employeeId && input.employeeId !== profile.employeeId) throw new BadRequestException('Учётную запись грумера изменить нельзя');
    input = { ...input, employeeId: profile.employeeId };
    const employee = await this.prisma.employee.findUnique({ where: { id: profile.employeeId } });
    if (!employee || (input.isActive && employee.status !== 'ACTIVE')) throw new BadRequestException('Выберите действующего сотрудника');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const { version, employeeId: ignoredEmployeeId, ...fields } = input;
      const data = { ...fields, displayName: fields.displayName.trim(), maxUserId: fields.maxUserId || null };
      const changed = await tx.groomingSpecialist.updateMany({ where: { id, installationId: installation.id, version: version ?? -1 }, data: { ...data, version: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('Профиль изменился. Обновите страницу');
      if (employee.accountScope === 'GROOMING') await tx.employee.update({ where: { id: employee.id }, data: { fullName: data.displayName } });
      await this.audit.log({ actorId: actor.id, action: 'grooming.specialist.save', entityType: 'GroomingSpecialist', entityId: id || input.employeeId }, tx);
      return { ok: true };
    });
  }
  async saveRule(input: GroomingRuleDto, actor: AuthEmployee, id?: string) {
    const installation = await this.modules.installation('GROOMING');
    return this.prisma.$transaction(async tx => { await lockGroomingSchedule(tx); return this.saveRuleInTransaction(tx, installation.id, input, actor, id); });
  }
  private async saveRuleInTransaction(tx: Prisma.TransactionClient, installationId: string, input: GroomingRuleDto, actor: AuthEmployee, id?: string) {
    if ([input.durationMinutes, input.bufferMinutes, input.stepMinutes].some(n => n % 5)) throw new BadRequestException('Длительность, подготовка и шаг должны быть кратны 5 минутам');
      const specialist = await tx.groomingSpecialist.findFirst({ where: { id: input.specialistId, installationId: installationId }, include: { employee: true } });
      const workplace = await tx.groomingWorkplace.findUnique({ where: { id: input.workplaceId }, include: { location: true } });
      const service = await tx.groomingService.findUnique({ where: { id: input.serviceId } });
      if (!specialist || !workplace || workplace.location.installationId !== installationId || workplace.locationId !== input.locationId || !service || service.installationId !== installationId || !specialist.species.includes(input.species)) throw new BadRequestException('Проверьте специалиста, вид питомца, услугу и рабочее место');
      if ((service.catalogData as Record<string, unknown> | null)?.species && !['ANY', input.species].includes(String((service.catalogData as Record<string, unknown>).species))) throw new BadRequestException('Услуга предназначена для другого вида питомца');
      if (input.isActive && !groomingServiceBookable(service)) throw new BadRequestException('Сначала уточните цену; доплаты не записываются отдельно');
      if (input.isActive && (!specialist.isActive || specialist.employee.status !== 'ACTIVE' || !service.isActive)) throw new BadRequestException('Для записи нужны действующие специалист и услуга');
      const { version, ...data } = input;
      if (id) {
        const changed = await tx.groomingServiceRule.updateMany({ where: { id, installationId: installationId, version: version ?? -1 }, data: { ...data, version: { increment: 1 } } });
        if (!changed.count) throw new ConflictException('Правило изменилось. Обновите страницу');
      } else await tx.groomingServiceRule.create({ data: { ...data, installationId: installationId } });
      await this.audit.log({ actorId: actor.id, action: 'grooming.rule.save', entityType: 'GroomingServiceRule', entityId: id || input.specialistId }, tx);
      return { ok: true };
  }
  async saveRules(input: GroomingRulesBatchDto, actor: AuthEmployee) {
    const installation = await this.modules.installation('GROOMING');
    return this.prisma.$transaction(async tx => {
      await lockGroomingSchedule(tx);
      const receiptId = `grooming:rules:${actor.id}:${input.clientKey}`, fingerprint = digest(input.rules);
      const previous = await tx.groomingCommandReceipt.findUnique({ where: { id: receiptId } });
      if (previous) { if (previous.fingerprint !== fingerprint) throw new ConflictException('Этот запрос уже использован'); return previous.result; }
      let created = 0, preserved = 0;
      for (const rule of input.rules) {
        const existing = await tx.groomingServiceRule.findFirst({ where: { installationId: installation.id, serviceId: rule.serviceId, specialistId: rule.specialistId, locationId: rule.locationId, workplaceId: rule.workplaceId, species: rule.species, size: rule.size, coat: rule.coat } });
        if (existing) {
          if (['durationMinutes','bufferMinutes','stepMinutes','minimumLeadMinutes','maximumDaysAhead','isActive'].some(k => existing[k as keyof typeof existing] !== rule[k as keyof GroomingRuleDto])) throw new ConflictException('Для одной из услуг уже задана другая длительность. Измените существующую настройку. Новые настройки не добавлены.');
          preserved++; continue;
        }
        await this.saveRuleInTransaction(tx, installation.id, rule, actor); created++;
      }
      const result = { created, preserved };
      await tx.groomingCommandReceipt.create({ data: { id: receiptId, fingerprint, result } }); return result;
    }, { timeout: 30000 });
  }
  async bookings(actor: AuthEmployee, from?: string, to?: string) {
    if (!this.manager(actor) && !await this.prisma.groomingSpecialist.findUnique({ where: { employeeId: actor.id } })) throw new ForbiddenException('Профиль грумера не найден');
    return this.prisma.groomingReservation.findMany({ where: { ...this.scope(actor), ...(from || to ? { startsAt: { ...(from ? { gte: date(from) } : {}), ...(to ? { lt: date(to) } : {}) } } : {}) }, include: bookingInclude, orderBy: { startsAt: 'asc' }, take: from && to ? 5000 : 500 });
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
    return { enabled, selfBookingEnabled: enabled && settings.selfBookingEnabled && (!settings.testClientMaxId || owner.maxUserId === settings.testClientMaxId), testMode: Boolean(settings.testClientMaxId), mode: process.env.GROOMING_QA_MODE === 'true' && process.env.NODE_ENV !== 'production' ? 'qa' : 'live', qaDelivery: process.env.GROOMING_QA_MODE === 'true' && process.env.NODE_ENV !== 'production' ? process.env.GROOMING_QA_DELIVERY || 'fake' : undefined, minimumCancelMinutes: settings.minimumCancelMinutes, owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone }, animals,
      services: [...new Map(rules.map(r => [r.serviceId, { id: r.serviceId, title: r.service.title, price: r.service.price, maximumPrice: r.service.maximumPrice, priceType: r.service.priceType, priceLabel: groomingPriceLabel(r.service), catalogKey: r.service.catalogKey, catalogData: r.service.catalogData, species: [...new Set(rules.filter(x => x.serviceId === r.serviceId).map(x => x.species))] }])).values()],
      specialists: [...new Map(rules.map(r => [r.specialistId, { id: r.specialistId, displayName: r.specialist.displayName, species: r.specialist.species }])).values()],
      bookings: bookings.map(publicBooking) };
  }
  private async assertTestClient(ownerId: string, tx: Prisma.TransactionClient = this.prisma) {
    const settings = await tx.groomingSettings.findFirst();
    if (settings?.testClientMaxId) { const owner = await tx.owner.findUnique({ where: { id: ownerId }, select: { maxUserId: true } }); if (owner?.maxUserId !== settings.testClientMaxId) throw new ForbiddenException('Идёт тестовый запуск. Самостоятельная запись скоро откроется.'); }
  }
  async options(ownerId: string, input: GroomingOptionsDto, now = new Date(), actor?: AuthEmployee) {
    await this.owner(ownerId); await this.animal(ownerId, input.animalId, input.species);
    if (!actor) await this.assertTestClient(ownerId);
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
      const shifts = await this.prisma.groomingWorkPeriod.findMany({ where: { specialistId: rule.specialistId, locationId: rule.locationId, OR: [{ workplaceId: null }, { workplaceId: rule.workplaceId }], kind: 'WORK', isActive: true, startsAt: { lt: to }, endsAt: { gt: from } } });
      for (const shift of shifts) {
        const start = Math.max(shift.startsAt.getTime(), from.getTime());
        const step = rule.stepMinutes * minute;
        for (let time = shift.startsAt.getTime() + Math.ceil((start - shift.startsAt.getTime()) / step) * step; time + (rule.durationMinutes + rule.bufferMinutes) * minute <= Math.min(shift.endsAt.getTime(), to.getTime()); time += step) {
          const begins = new Date(time), end = new Date(time + rule.durationMinutes * minute), blocked = new Date(end.getTime() + rule.bufferMinutes * minute);
          if (localDay(begins, rule.location.timezone) !== input.date) continue;
          if (await this.conflict(this.prisma, rule.specialist.employeeId, rule.workplaceId, begins, blocked, input.reservationId)) continue;
          const offer: Offer = { ownerId, animalId: input.animalId, ruleId: rule.id, ruleVersion: rule.version, serviceVersion: rule.service.updatedAt.toISOString(), startsAt: begins.toISOString(), expiresAt: new Date(now.getTime() + 5 * minute).toISOString(), species: input.species, size: input.size, coat: input.coat, ignoreId: input.reservationId, staff: Boolean(actor) };
          offers.push({ offerToken: this.sign(offer), startsAt: begins.toISOString(), endsAt: end.toISOString(), blockedUntil: blocked.toISOString(), expiresAt: offer.expiresAt, specialistId: rule.specialistId, specialistName: rule.specialist.displayName, serviceTitle: rule.service.title, price: rule.service.price, priceType: rule.service.priceType, maximumPrice: rule.service.maximumPrice, priceLabel: groomingPriceLabel(rule.service), durationMinutes: rule.durationMinutes, bufferMinutes: rule.bufferMinutes, timezone: rule.location.timezone, locationName: rule.location.name });
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
      if (!actor) await this.assertTestClient(ownerId, tx);
      if (actor && !this.manager(actor)) throw new ForbiddenException('Создавать и переносить записи может администратор');
      const offer = this.verify(input.offerToken);
      if (offer.ownerId !== ownerId || offer.staff !== Boolean(actor) || (offer.ignoreId || undefined) !== reschedule?.id || date(offer.expiresAt) <= now) throw new ConflictException('Предложение истекло. Обновите свободное время');
      await this.owner(ownerId, tx); await this.animal(ownerId, offer.animalId, offer.species, tx);
      const rule = await tx.groomingServiceRule.findUnique({ where: { id: offer.ruleId }, include: ruleInclude });
      if (!rule || !usable(rule) || rule.version !== offer.ruleVersion || rule.service.updatedAt.toISOString() !== offer.serviceVersion) throw new ConflictException('Условия услуги изменились. Обновите свободное время');
      const startsAt = date(offer.startsAt), endsAt = new Date(startsAt.getTime() + rule.durationMinutes * minute), blockedUntil = new Date(endsAt.getTime() + rule.bufferMinutes * minute);
      if (startsAt.getTime() < now.getTime() + (actor ? 0 : rule.minimumLeadMinutes * minute) || startsAt.getTime() > now.getTime() + rule.maximumDaysAhead * day) throw new ConflictException('Это время больше недоступно');
      const shift = await tx.groomingWorkPeriod.findFirst({ where: { specialistId: rule.specialistId, locationId: rule.locationId, OR: [{ workplaceId: null }, { workplaceId: rule.workplaceId }], kind: 'WORK', isActive: true, startsAt: { lte: startsAt }, endsAt: { gte: blockedUntil } } });
      if (!shift || await this.conflict(tx, rule.specialist.employeeId, rule.workplaceId, startsAt, blockedUntil, reschedule?.id)) throw new ConflictException('Время уже занято. Выберите другой интервал');
      let current: Booking | undefined;
      if (reschedule) {
        current = await this.editable(reschedule.id, ownerId, actor, tx);
        if (current.version !== reschedule.version || current.status !== 'CONFIRMED') throw new ConflictException('Запись уже изменилась. Обновите кабинет');
        if (!actor) await this.checkCancelWindow(current, now, tx);
        if (current.animalId !== offer.animalId) throw new BadRequestException('При переносе питомец сохраняется');
        await tx.groomingNotification.updateMany({ where: { reservationId: current.id, status: { in: ['QUEUED', 'FAILED'] } }, data: { status: 'CANCELLED', lastError: 'Запись перенесена' } });
      }
      const data = { installationId: rule.installationId, ruleId: rule.id, ownerId, animalId: offer.animalId, employeeId: rule.specialist.employeeId, locationId: rule.locationId, workplaceId: rule.workplaceId, serviceTitle: rule.service.title, price: rule.service.price, priceType: rule.service.priceType, maximumPrice: rule.service.maximumPrice, species: offer.species, size: offer.size, coat: offer.coat, startsAt, endsAt, blockedUntil, notes: input.notes?.trim() || '', looks: json(input.looks || []), source: actor ? 'CRM' : 'CLIENT_PORTAL' };
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
    for (const recipient of recipients) await tx.groomingNotification.create({ data: { reservationId: booking.id, reservationVersion: booking.version, event, recipientKind: recipient.kind, recipientId: recipient.id, dedupeKey: `${booking.id}:${booking.version}:${event}:${recipient.kind}:${recipient.id}`, text: `${recipient.kind === 'OWNER' ? 'Для клиента. ' : 'Для грумера / администратора. '}${text}`.slice(0, 800), scheduledAt: now, expiresAt } });
    if (event === 'CANCELLED') return;
    for (const hours of settings?.reminderHours || [24]) {
      const scheduledAt = new Date(booking.startsAt.getTime() - hours * 3600000);
      if (scheduledAt.getTime() <= now.getTime() + 5 * minute) continue;
      await tx.groomingNotification.create({ data: { reservationId: booking.id, reservationVersion: booking.version, event: 'REMINDER', recipientKind: 'OWNER', recipientId: booking.ownerId, dedupeKey: `${booking.id}:${booking.version}:REMINDER:${hours}:${booking.ownerId}`, text: `TemichevVet · Груминг: напоминаем о записи. ${booking.animal.nickname}, ${when}. Специалист: ${specialist?.displayName || booking.employee.fullName}. Подробности в кабинете.`.slice(0, 800), scheduledAt, expiresAt: booking.startsAt } });
      if (specialist?.maxUserId) await tx.groomingNotification.create({ data: { reservationId: booking.id, reservationVersion: booking.version, event: 'REMINDER', recipientKind: 'STAFF', recipientId: specialist.maxUserId, dedupeKey: `${booking.id}:${booking.version}:REMINDER:${hours}:STAFF:${specialist.maxUserId}`, text: `TemichevVet · Напоминание грумеру: ${booking.animal.nickname}, ${when}. ${booking.serviceTitle}. Подробности в вашем модуле.`.slice(0, 800), scheduledAt, expiresAt: booking.startsAt } });
    }
  }
  private secret() { const value = process.env.GROOMING_BOOKING_SIGNING_SECRET?.trim() || process.env.OWNER_GATEWAY_SYNC_SECRET?.trim(); if (!value || value.length < 24) throw new ServiceUnavailableException('Подписание записи не настроено'); return value; }
  private sign(offer: Offer) { const body = Buffer.from(JSON.stringify(offer)).toString('base64url'); return `${body}.${createHmac('sha256', this.secret()).update(body).digest('base64url')}`; }
  private verify(token: string): Offer {
    try { const [body, signature, extra] = token.split('.'); const expected = createHmac('sha256', this.secret()).update(body).digest(); const received = Buffer.from(signature, 'base64url'); if (extra || received.length !== expected.length || !timingSafeEqual(received, expected)) throw Error(); const value = JSON.parse(Buffer.from(body, 'base64url').toString()) as Offer; if (!value.ruleId || !value.ownerId || !value.animalId || !value.expiresAt) throw Error(); return value; } catch { throw new ConflictException('Предложение недействительно. Обновите свободное время'); }
  }
}
function usable(rule: Rule) { return rule.isActive && rule.specialist.isActive && rule.specialist.employee.status === 'ACTIVE' && rule.service.isActive && groomingServiceBookable(rule.service) && rule.location.isActive && rule.workplace.isActive && rule.specialist.species.includes(rule.species); }
function date(value: string) { const result = new Date(value); if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(result.getTime())) throw new BadRequestException('Укажите дату с часовым поясом'); return result; }
function localDay(value: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value); }
function publicBooking(booking: Booking) { const { owner, rule, ...rest } = booking; return { ...rest, serviceId: rule.serviceId, price: booking.price.toString(), maximumPrice: booking.maximumPrice?.toString() ?? null, priceType: booking.priceType, priceLabel: groomingPriceLabel(booking) }; }
