import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuditService } from '../audit/audit.service';
import { ClinicConversationSyncService } from './clinic-conversation-sync.service';
import { lockOnlineRequest } from './online-request-attention.service';
import { AssistantBookDto, AssistantBookingOptionsDto, AssistantBookingRuleDto } from './dto/assistant-booking.dto';
import { withinOfficeHours } from './assistant-booking-hours';
import { matchesBookingDate, selectBookingDate, selectBookingService } from './assistant-booking-selection';

import { requireContactPhone } from '../../common/phone';
import { intakeKind, ordinaryIntakeQuery, previousMonth } from './assistant-intake-policy';

const minute = 60_000, day = 86400_000;
const includeRule = { office: true, room: true, service: true, employee: { include: { roles: { include: { role: true } } } } } satisfies Prisma.AssistantBookingRuleInclude;
type Rule = Prisma.AssistantBookingRuleGetPayload<{ include: typeof includeRule }>;
type Offer = { v: 1; ruleId: string; ruleVersion: number; ownerId: string; startsAt: string; endsAt: string; expiresAt: string };
const resultInclude = { appointment: { include: { office: true, employee: true } } } satisfies Prisma.OnlineAppointmentRequestInclude;

@Injectable()
export class AssistantBookingService {
  constructor(private readonly prisma: PrismaService, private readonly appointments: AppointmentsService,
    private readonly audit: AuditService, private readonly conversations: ClinicConversationSyncService) {}

  assertEnabled() {
    if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true' || process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED !== 'true') throw new NotFoundException('Самостоятельная запись пока не включена');
    this.signingSecret();
  }

  listRules() { return this.prisma.assistantBookingRule.findMany({ orderBy: { createdAt: 'asc' }, include: includeRule }); }
  async readiness(now = new Date()) {
    const rows = await this.listRules();
    const usable = rows.filter(eligible);
    const checks = await Promise.all(usable.map(async rule => ({ id: rule.id, hasShift: Boolean(await this.prisma.employeeShift.findFirst({
      where: { employeeId: rule.employeeId, isActive: true, startsAt: { lt: new Date(now.getTime() + rule.maximumDaysAhead * day) }, endsAt: { gt: new Date(now.getTime() + rule.minimumLeadMinutes * minute) } }, select: { id: true },
    })) })));
    return { enabled: process.env.CLINIC_ASSISTANT_ENABLED === 'true' && process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED === 'true',
      totalRules: rows.length, activeRules: rows.filter(r => r.isActive).length, eligibleRules: usable.length, rulesWithShifts: checks.filter(r => r.hasShift).length };
  }
  async resources() {
    const [offices, rooms, services, employees] = await Promise.all([
      this.prisma.clinicOffice.findMany({ select: { id: true, name: true, timezone: true }, orderBy: { name: 'asc' } }),
      this.prisma.room.findMany({ select: { id: true, name: true, officeId: true }, orderBy: { name: 'asc' } }),
      this.prisma.service.findMany({ where: { isActive: true, publicOnWebsite: true }, select: { id: true, title: true }, orderBy: { title: 'asc' } }),
      this.prisma.employee.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { code: 'doctor' } } } }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
    ]);
    return { offices, rooms, services, employees };
  }
  async saveRule(input: AssistantBookingRuleDto, actorId: string, id?: string) {
    if (input.durationMinutes % 5 || input.stepMinutes % 5) throw new BadRequestException('Длительность и шаг должны быть кратны 5 минутам');
    return this.prisma.$transaction(async tx => {
      const [office, room, service, employee] = await Promise.all([
        tx.clinicOffice.findUnique({ where: { id: input.officeId } }), tx.room.findUnique({ where: { id: input.roomId } }),
        tx.service.findUnique({ where: { id: input.serviceId } }), tx.employee.findUnique({ where: { id: input.employeeId }, include: { roles: { include: { role: true } } } }),
      ]);
      if (!office || !room || room.officeId !== office.id || !service || !employee) throw new BadRequestException('Проверьте услугу, врача и кабинет выбранного филиала');
      if (input.isActive && (!service.isActive || !service.publicOnWebsite || employee.status !== 'ACTIVE' || !employee.roles.some(x => x.role.code === 'doctor'))) throw new BadRequestException('Для записи нужны опубликованная активная услуга и действующий врач');
      try { new Intl.DateTimeFormat('ru-RU', { timeZone: office.timezone }); } catch { throw new BadRequestException('Проверьте часовой пояс филиала'); }
      const row = id ? await tx.assistantBookingRule.update({ where: { id }, data: { ...input, isActive: input.isActive ?? false, version: { increment: 1 } } })
        : await tx.assistantBookingRule.create({ data: { ...input, isActive: input.isActive ?? false } });
      await this.audit.log({ actorId, action: 'assistant_booking.rule.save', entityType: 'AssistantBookingRule', entityId: row.id }, tx);
      return row;
    });
  }
  async disableRule(id: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const row = await tx.assistantBookingRule.update({ where: { id }, data: { isActive: false, version: { increment: 1 } } });
      await this.audit.log({ actorId, action: 'assistant_booking.rule.disable', entityType: 'AssistantBookingRule', entityId: id }, tx);
      return row;
    });
  }

  async options(input: AssistantBookingOptionsDto, now = new Date()) {
    this.assertEnabled();
    if (!await this.prisma.owner.findUnique({ where: { id: input.ownerId }, select: { id: true } })) throw new BadRequestException('Войдите в личный кабинет владельца');
    const from = input.from ? explicitDate(input.from) : now;
    if (from < now || from.getTime() > now.getTime() + 60 * day) throw new BadRequestException('Выберите ближайший период записи');
    const hasDate = Boolean(input.date || input.preferredTimeText?.trim());
    const to = new Date(from.getTime() + (hasDate ? 61 : Math.min(input.days ?? 2, 7)) * day);
    const availableRules = (await this.prisma.assistantBookingRule.findMany({ where: { isActive: true }, include: includeRule, orderBy: { id: 'asc' } })).filter(eligible);
    let animals = await this.prisma.animal.findMany({ where: { ownerId: input.ownerId, archivedAt: null }, select: { id: true, nickname: true }, orderBy: { nickname: 'asc' }, take: 100 });
    const allServices = [...new Map(availableRules.map(r => [r.serviceId, { id: r.serviceId, title: r.service.title }])).values()];
    const initial = allServices.filter(s => intakeKind(s.title) === 'INITIAL');
    const followup = allServices.filter(s => intakeKind(s.title) === 'FOLLOWUP');
    let selectedService = selectBookingService(allServices, input.serviceQuery, input.serviceId);
    if (initial.length && !input.serviceId && ordinaryIntakeQuery(input.serviceQuery)) selectedService = { state: 'MATCHED', services: initial };
    if (followup.length && !input.serviceId && /повторн/i.test(input.serviceQuery || '')) selectedService = { state: 'MATCHED', services: followup };
    const requestedFollowup = selectedService.services.length > 0 && selectedService.services.every(s => intakeKind(s.title) === 'FOLLOWUP');
    if (requestedFollowup && input.recentVisitAnswer === undefined) return { animals, services: selectedService.services, offers: [], generatedAt: now.toISOString(), selection: {
      serviceState: 'MATCHED', dateState: 'ANY', followupQuestion: true, message: 'Этот питомец был на приёме у нас в течение последнего месяца? Повторным считается приём в течение месяца после предыдущего визита.' } };
    let convertedToInitial = false;
    let recentVisits: Array<{ animalId: string; startedAt: Date }> = [];
    if (requestedFollowup && input.recentVisitAnswer) {
      const earliest = new Date(Math.min(...availableRules.filter(r => selectedService.services.some(s => s.id === r.serviceId)).map(r => previousMonth(from, r.office.timezone).getTime())));
      recentVisits = await this.prisma.visit.findMany({ where: { ownerId: input.ownerId, animalId: { in: animals.map(a => a.id) }, status: 'COMPLETED', startedAt: { gte: earliest, lte: now } }, select: { animalId: true, startedAt: true }, orderBy: { startedAt: 'desc' }, take: 1000 });
    }
    if (requestedFollowup && (!input.recentVisitAnswer || !recentVisits.length) && initial.length) {
      selectedService = { state: 'MATCHED', services: initial }; convertedToInitial = true;
    }
    const kinds = new Set(selectedService.services.map(s => intakeKind(s.title)));
    const visitKind = kinds.size === 1 ? kinds.values().next().value ?? null : null;
    if (visitKind === 'FOLLOWUP') animals = animals.filter(a => recentVisits.some(v => v.animalId === a.id));
    const services = selectedService.services;
    const rules = ['ANY', 'MATCHED'].includes(selectedService.state) ? availableRules.filter(r => services.some(s => s.id === r.serviceId)) : [];
    let dateNeedsClarification = false;
    const offers: Array<{ offerToken: string; serviceId: string; serviceTitle: string; employeeName: string; officeId: string; officeName: string; timezone: string; startsAt: string; endsAt: string; durationMinutes: number; expiresAt: string }> = [];
    for (const rule of rules) {
      const selectedDate = selectBookingDate(input.preferredTimeText, input.date, now, rule.office.timezone);
      if (selectedDate.state === 'CLARIFY') { dateNeedsClarification = true; continue; }
      const earliest = Math.max(from.getTime(), now.getTime() + rule.minimumLeadMinutes * minute);
      const latest = Math.min(to.getTime(), now.getTime() + rule.maximumDaysAhead * day);
      if (earliest >= latest) continue;
      const shifts = await this.prisma.employeeShift.findMany({ where: { employeeId: rule.employeeId, isActive: true, startsAt: { lt: new Date(latest) }, endsAt: { gt: new Date(earliest) } }, orderBy: { startsAt: 'asc' }, take: 100 });
      const occupied = await this.prisma.appointment.findMany({ where: { status: { in: ['PLANNED', 'ARRIVED', 'IN_PROGRESS'] }, OR: [{ employeeId: rule.employeeId }, { roomId: rule.roomId }], startsAt: { lt: new Date(latest) }, AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date(earliest) } }] }] }, select: { startsAt: true, endsAt: true } });
      const seen = new Set<number>(); let count = 0;
      for (const shift of shifts) {
        const shiftStart = Math.ceil(shift.startsAt.getTime() / minute) * minute;
        for (let t = shiftStart + Math.ceil(Math.max(0, earliest - shiftStart) / (rule.stepMinutes * minute)) * rule.stepMinutes * minute;
          t + rule.durationMinutes * minute <= Math.min(latest, shift.endsAt.getTime()); t += rule.stepMinutes * minute) {
          if (seen.has(t) || count >= 60) continue;
          seen.add(t);
          const start = new Date(t), end = new Date(t + rule.durationMinutes * minute);
          if (visitKind === 'FOLLOWUP' && !recentVisits.some(v => v.startedAt >= previousMonth(start, rule.office.timezone))) continue;
          if (!matchesBookingDate(start, rule.office.timezone, selectedDate) || !withinOfficeHours(start, end, rule.office.timezone, rule.office.workingHours) || occupied.some(x => x.startsAt < end && (!x.endsAt || x.endsAt > start))) continue;
          const offer: Offer = { v: 1, ruleId: rule.id, ruleVersion: rule.version, ownerId: input.ownerId, startsAt: start.toISOString(), endsAt: end.toISOString(), expiresAt: new Date(now.getTime() + 5 * minute).toISOString() };
          offers.push({ offerToken: this.sign(offer), serviceId: rule.serviceId, serviceTitle: rule.service.title, employeeName: rule.employee.fullName, officeId: rule.officeId, officeName: rule.office.name, timezone: rule.office.timezone, startsAt: offer.startsAt, endsAt: offer.endsAt, durationMinutes: rule.durationMinutes, expiresAt: offer.expiresAt }); count++;
        }
      }
    }
    offers.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.offerToken.localeCompare(b.offerToken));
    // Intake is with any available doctor. Do not make the owner choose rooms or duplicate times.
    const visibleOffers = visitKind ? [...new Map(offers.map(o => [`${o.serviceId}|${o.officeId}|${o.startsAt}`, o])).values()] : offers;
    const message = !availableRules.length ? 'Самостоятельная запись сейчас не настроена. Можно оставить заявку администратору — он подберёт время.'
      : selectedService.state === 'CHOOSE' ? 'Подходит несколько услуг. Выберите нужную услугу ниже.'
      : selectedService.state === 'UNAVAILABLE' ? 'Эту услугу нельзя выбрать для самостоятельной записи. Выберите другую или позовите администратора.'
      : dateNeedsClarification ? 'Уточните удобную дату и время: например, «завтра после 15:00», или выберите дату ниже.'
      : !offers.length ? 'На выбранный период свободного времени нет. Выберите другую дату или позовите администратора.'
      : visitKind ? `Выберите питомца и свободное время.${offers[0]?.durationMinutes ? ` Длительность приёма — ${offers[0].durationMinutes} минут.` : ''} Вас примет свободный врач. Запись подтвердится после вашего согласия и проверки клиники.`
      : 'Выберите питомца и одно из свободных времён ниже. Запись будет подтверждена после вашего согласия и проверки клиники.';
    return { animals, services, offers: dateNeedsClarification ? [] : visibleOffers.slice(0, 60), generatedAt: now.toISOString(), selection: { serviceState: selectedService.state, dateState: dateNeedsClarification ? 'CLARIFY' : hasDate ? 'MATCHED' : 'ANY', visitKind, followupQuestion: false,
      message: convertedToInitial ? `${input.recentVisitAnswer ? 'В CRM нет завершённого приёма этого питомца за последний месяц.' : 'Если прошло больше месяца, приём считается первичным.'} Предлагаю первичный приём. ${message}` : message } };
  }

  async book(input: AssistantBookDto, now = new Date(), allowNew = true) {
    this.assertEnabled();
    if (!input.contactConsent || !input.appointmentConsent) throw new BadRequestException('Подтвердите выбранное время и согласие на связь по записи');
    const fingerprint = createHash('sha256').update(JSON.stringify({ ownerId: input.ownerId, animalId: input.animalId, conversationId: input.conversationId, bookingSequence: input.bookingSequence, offerToken: input.offerToken, comment: input.comment?.trim() || '', ...(input.contactPhone ? { contactPhone: requireContactPhone(input.contactPhone) } : {}) })).digest('hex');
    return this.prisma.$transaction(async tx => {
      // Arbitrate initial request linkage and idempotency before schedule locking.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, 5)`;
      const previous = await tx.onlineAppointmentRequest.findUnique({ where: { assistantBookingKey: input.clientKey }, include: resultInclude });
      if (previous) {
        if (previous.assistantBookingFingerprint !== fingerprint || previous.ownerId !== input.ownerId) throw new ConflictException('Ключ подтверждения уже использован для другой записи');
        return this.result(previous);
      }
      if (!allowNew) throw new ConflictException('Обращение сейчас обрабатывает администратор');
      const episode = await tx.onlineAppointmentRequest.findUnique({ where: { conversationId_assistantBookingSequence: { conversationId: input.conversationId, assistantBookingSequence: input.bookingSequence } } });
      if (episode) throw new ConflictException('Это обращение уже записано. Начните новую запись в чате');
      const offer = this.verify(input.offerToken);
      const start = explicitDate(offer.startsAt), end = explicitDate(offer.endsAt);
      if (offer.ownerId !== input.ownerId || explicitDate(offer.expiresAt) <= now) throw new ConflictException('Предложение времени истекло. Обновите свободное время');
      await tx.$queryRaw`SELECT "id" FROM "AssistantBookingRule" WHERE "id" = ${offer.ruleId} FOR SHARE`;
      const rule = await tx.assistantBookingRule.findUnique({ where: { id: offer.ruleId }, include: includeRule });
      if (!rule || !eligible(rule) || rule.version !== offer.ruleVersion) throw new ConflictException('Правила записи изменились. Обновите свободное время');
      await tx.$queryRaw`SELECT "id" FROM "ClinicOffice" WHERE "id" = ${rule.officeId} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${rule.serviceId} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${rule.employeeId} FOR SHARE`;
      await tx.$queryRaw`SELECT er."employeeId" FROM "EmployeeRole" er JOIN "Role" r ON r."id" = er."roleId" WHERE er."employeeId" = ${rule.employeeId} FOR SHARE OF er, r`;
      await tx.$queryRaw`SELECT "id" FROM "Room" WHERE "id" = ${rule.roomId} FOR SHARE`;
      const current = await tx.assistantBookingRule.findUniqueOrThrow({ where: { id: rule.id }, include: includeRule });
      if (!eligible(current) || end.getTime() - start.getTime() !== current.durationMinutes * minute || start.getTime() < now.getTime() + current.minimumLeadMinutes * minute || end.getTime() > now.getTime() + current.maximumDaysAhead * day || !withinOfficeHours(start, end, current.office.timezone, current.office.workingHours)) throw new ConflictException('Это время больше недоступно для самостоятельной записи');
      const shifts = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "EmployeeShift" WHERE "employeeId" = ${current.employeeId} AND "isActive" = true AND "startsAt" <= ${start} AND "endsAt" >= ${end} FOR SHARE`;
      if (!shifts.length) throw new ConflictException('Смена врача изменилась. Обновите свободное время');
      await tx.$queryRaw`SELECT "id" FROM "Owner" WHERE "id" = ${input.ownerId} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Animal" WHERE "id" = ${input.animalId} FOR SHARE`;
      const owner = await tx.owner.findUnique({ where: { id: input.ownerId } });
      const animal = await tx.animal.findUnique({ where: { id: input.animalId } });
      if (!owner || !animal || animal.ownerId !== owner.id || animal.archivedAt) throw new BadRequestException('Выберите действующего питомца своего личного кабинета');
      if (intakeKind(current.service.title) === 'FOLLOWUP' && !await tx.visit.findFirst({ where: { ownerId: owner.id, animalId: animal.id, status: 'COMPLETED', startedAt: { gte: previousMonth(start, current.office.timezone), lte: now } }, select: { id: true } })) throw new ConflictException('Повторный приём возможен в течение месяца после предыдущего визита. Выберите первичный приём или уточните у администратора');
      const phone = requireContactPhone(input.contactPhone || owner.phone);
      // Serialize linkage with the ordinary conversation importer as well.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, 3)`;
      const latest = await tx.onlineAppointmentRequest.findFirst({ where: { conversationId: input.conversationId }, orderBy: { createdAt: 'desc' } });
      let request;
      if (latest && ['NEW', 'IN_REVIEW'].includes(latest.status)) {
        await lockOnlineRequest(tx, latest.id);
        request = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: latest.id } });
        if (request.assignedEmployeeId || request.status !== 'NEW') throw new ConflictException('Заявку уже обрабатывает администратор. Продолжите переписку с ним');
        if (request.ownerId && request.ownerId !== owner.id) throw new ConflictException('Заявка не соответствует владельцу');
        const snapshot = request.conversationSnapshot as Prisma.JsonObject | null;
        if (Number(snapshot?.bookingSequence || 0) > input.bookingSequence) throw new ConflictException('В чате уже появилась другая заявка');
      } else {
        const snapshot = latest?.conversationSnapshot as Prisma.JsonObject | null;
        if (latest && Math.max(Number(snapshot?.bookingSequence || 0), latest.assistantBookingSequence || 0) >= input.bookingSequence) throw new ConflictException('Эта заявка уже обработана');
        request = await tx.onlineAppointmentRequest.create({ data: { ownerName: owner.fullName, phone, animalNickname: animal.nickname, source: 'ASSISTANT_BOOKING', conversationId: input.conversationId, ownerId: owner.id, animalId: animal.id, comment: input.comment?.trim() || current.service.title } });
      }
      const appointment = await this.appointments.createAppointmentInTransaction(tx, { ownerId: owner.id, animalId: animal.id, officeId: current.officeId, employeeId: current.employeeId, roomId: current.roomId, startsAt: start.toISOString(), endsAt: end.toISOString(), comment: `${current.service.title}${input.comment?.trim() ? `: ${input.comment.trim()}` : ''}` });
      const confirmed = await tx.onlineAppointmentRequest.update({ where: { id: request.id }, data: { status: 'ACCEPTED', phone, ownerId: owner.id, animalId: animal.id, appointmentId: appointment.id, preferredAt: start, assistantBookingKey: input.clientKey, assistantBookingFingerprint: fingerprint, assistantBookingSequence: input.bookingSequence, conversationVersion: Math.max(request.conversationVersion, input.bookingSequence), conversationNeedsAttention: false }, include: resultInclude });
      await this.conversations.queueConfirmation(tx, confirmed, appointment);
      await this.audit.log({ action: 'assistant_booking.confirm', entityType: 'OnlineAppointmentRequest', entityId: confirmed.id, metadata: { appointmentId: appointment.id, ruleId: current.id, serviceId: current.serviceId, bookingSequence: input.bookingSequence, contactConsent: true, appointmentConsent: true } }, tx);
      return this.result(confirmed);
    });
  }

  private result(request: Prisma.OnlineAppointmentRequestGetPayload<{ include: typeof resultInclude }>) {
    const appointment = request.appointment;
    if (!appointment) throw new ConflictException('Ранее подтверждённая запись больше недоступна. Обратитесь к администратору');
    return { requestId: request.id, appointmentId: appointment.id, status: appointment.status, startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt?.toISOString() || null, timezone: appointment.office?.timezone || 'Europe/Moscow', officeName: appointment.office?.name || '', employeeName: appointment.employee?.fullName || '' };
  }
  private signingSecret() {
    const secret = process.env.CLINIC_ASSISTANT_BOOKING_SIGNING_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('Защита предложений времени пока не настроена');
    return secret;
  }
  private sign(offer: Offer) {
    const body = Buffer.from(JSON.stringify(offer)).toString('base64url');
    return `${body}.${createHmac('sha256', this.signingSecret()).update(body).digest('base64url')}`;
  }
  private verify(token: string): Offer {
    const [body, signature, extra] = token.split('.');
    if (extra || !body || !signature || body.length > 3000 || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) throw new BadRequestException('Обновите предложение времени');
    const expected = createHmac('sha256', this.signingSecret()).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new BadRequestException('Предложение времени не подтверждено CRM');
    let offer: Offer;
    try { offer = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { throw new BadRequestException('Обновите предложение времени'); }
    if (offer.v !== 1 || typeof offer.ruleId !== 'string' || !Number.isSafeInteger(offer.ruleVersion) || typeof offer.ownerId !== 'string') throw new BadRequestException('Обновите предложение времени');
    return offer;
  }
}
function eligible(rule: Rule) {
  return rule.isActive && rule.service.isActive && rule.service.publicOnWebsite && rule.room.officeId === rule.officeId && rule.employee.status === 'ACTIVE' && rule.employee.roles.some(x => x.role.code === 'doctor');
}
function explicitDate(value: string): Date {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException('Дата должна содержать часовой пояс');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BadRequestException('Укажите корректную дату');
  return date;
}
