import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as GatewayDb } from '../apps/owner-gateway/src/generated/client/index.js';
import { ClinicChatService } from '../apps/owner-gateway/dist/clinic-chat.service.js';
import { ClinicChatBookingService } from '../apps/owner-gateway/dist/clinic-chat-booking.service.js';
import { AssistantBookingService } from '../apps/api/dist/modules/online-requests/assistant-booking.service.js';
import { AssistantBookingSyncService } from '../apps/api/dist/modules/online-requests/assistant-booking-sync.service.js';
import { ClinicConversationSyncService } from '../apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js';
import { AppointmentsService } from '../apps/api/dist/modules/appointments/appointments.service.js';
import { SchedulingService } from '../apps/api/dist/modules/scheduling/scheduling.service.js';
import { AuditService } from '../apps/api/dist/modules/audit/audit.service.js';
import { hashToken } from '../apps/owner-gateway/dist/security.js';
const url = process.env.ASSISTANT_TEST_DATABASE_URL, gatewayUrl = process.env.ASSISTANT_TEST_GATEWAY_DATABASE_URL;
test('isolated PostgreSQL: durable chat booking bridge', { skip: !url || !gatewayUrl }, async t => {
  for (const [value, name] of [[url, 'crm_assistant_qa'], [gatewayUrl, 'crm_assistant_gateway_qa']]) {
    const parsed = new URL(value); assert.equal(parsed.hostname, '127.0.0.1'); assert.equal(parsed.port, '15488'); assert.equal(parsed.pathname, `/${name}`);
  }
  Object.assign(process.env, { CLINIC_ASSISTANT_ENABLED: 'true', CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED: 'true', CLINIC_ASSISTANT_MODEL_ENABLED: 'false', CLINIC_ASSISTANT_BOOKING_SIGNING_SECRET: 'synthetic-offer-signing-secret-only-20261008' });
  const db = new PrismaClient({ datasources: { db: { url } } }), gateway = new GatewayDb({ datasources: { db: { url: gatewayUrl } } });
  const chat = new ClinicChatService(gateway), slots = new ClinicChatBookingService(gateway, chat), sync = new ClinicConversationSyncService(db);
  const audit = new AuditService(db), appointments = new AppointmentsService(db, audit, new SchedulingService(db, audit));
  const booking = new AssistantBookingService(db, appointments, audit, sync);
  const ids = [], ownerIds = [], rules = [];
  t.after(async () => {
    await gateway.clinicBookingOperation.updateMany({ where: { conversationId: { in: ids }, status: 'PENDING' }, data: { status: 'FAILED', error: 'Synthetic test finished' } });
    await db.assistantBookingRule.updateMany({ where: { id: { in: rules } }, data: { isActive: false } });
    const requests = await db.onlineAppointmentRequest.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } });
    if (requests.length) await db.backgroundJob.updateMany({ where: { queueName: 'clinic-conversation', OR: requests.map(x => ({ payload: { path: ['requestId'], equals: x.id } })) }, data: { status: 'DONE' } });
    await db.$disconnect(); await gateway.$disconnect();
  });
  const doctorRole = await db.role.upsert({ where: { code: 'doctor' }, create: { code: 'doctor', title: 'QA doctor' }, update: {} });
  async function fixture() {
    const org = await db.organization.create({ data: { displayName: 'Synthetic chat booking bridge' } });
    const hours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isWorking: true, is24Hours: true }]));
    const office = await db.clinicOffice.create({ data: { organizationId: org.id, name: 'QA Moscow office', timezone: 'Europe/Moscow', workingHours: hours } });
    const room = await db.room.create({ data: { officeId: office.id, name: 'QA room' } });
    const owner = await db.owner.create({ data: { fullName: 'Synthetic verified owner', phone: '+79990000001' } }); ownerIds.push(owner.id);
    const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Synthetic cat' } });
    const doctor = await db.employee.create({ data: { fullName: 'Synthetic doctor', roles: { create: { roleId: doctorRole.id } } } });
    const service = await db.service.create({ data: { title: 'Synthetic examination', isActive: true, publicOnWebsite: true } });
    const startAt = new Date(Math.ceil((Date.now() + 3600_000) / 900_000) * 900_000);
    await db.employeeShift.create({ data: { employeeId: doctor.id, startsAt: startAt, endsAt: new Date(startAt.getTime() + 3 * 3600_000) } });
    const rule = await booking.saveRule({ officeId: office.id, roomId: room.id, employeeId: doctor.id, serviceId: service.id, isActive: true, durationMinutes: 30, stepMinutes: 15, minimumLeadMinutes: 0, maximumDaysAhead: 2 }, doctor.id); rules.push(rule.id);
    await gateway.ownerSnapshot.create({ data: { ownerId: owner.id, displayName: 'Synthetic verified owner', payload: {}, sourceVersion: 'synthetic', sourceUpdatedAt: new Date() } });
    const portalToken = randomBytes(32).toString('base64url');
    const portal = await gateway.portalSession.create({ data: { ownerId: owner.id, tokenHash: hashToken(portalToken), expiresAt: new Date(Date.now() + 3600_000) } });
    const session = await chat.start(portalToken); ids.push(session.conversation.id);
    return { owner, animal, doctor, rule, service, portal, portalToken, session };
  }
  function worker() {
    const instance = new AssistantBookingSyncService(booking);
    instance.gateway = async (path, body) => {
      if (path === '/booking-operations') return { items: (await slots.pending()).items.filter(x => ids.includes(x.conversationId)) };
      const id = path.split('/')[2]; return slots.complete(id, body);
    };
    return instance;
  }
  async function options(f) {
    const operation = await slots.options(f.session.token, f.portalToken, { clientKey: randomUUID(), serviceId: f.service.id, days: 1 });
    assert.equal(operation.status, 'PENDING'); await worker().syncNow();
    const result = await slots.read(f.session.token, f.portalToken, operation.id); assert.equal(result.status, 'DONE'); assert.ok(result.result.offers.length > 0);
    return result;
  }
  function confirmation(f, result) { return { clientKey: randomUUID(), optionsId: result.id, animalId: f.animal.id, offerToken: result.result.offers[0].offerToken, contactConsent: true, appointmentConsent: true }; }
  await t.test('guest, wrong owner, revoked session and foreign operation never disclose slots or pets', async () => {
    const f = await fixture(), other = await fixture(), guest = await chat.start();
    assert.deepEqual(await slots.latest(f.session.token, f.portalToken), { operation: null });
    await assert.rejects(slots.options(guest.token, f.portalToken, { clientKey: randomUUID() }), /личный кабинет/);
    await assert.rejects(slots.options(f.session.token, other.portalToken, { clientKey: randomUUID() }), /личный кабинет/);
    const result = await options(f);
    await assert.rejects(slots.read(other.session.token, other.portalToken, result.id), /не найден/);
    await gateway.portalSession.update({ where: { id: f.portal.id }, data: { revokedAt: new Date() } });
    await assert.rejects(slots.read(f.session.token, f.portalToken, result.id), /личный кабинет/);
    assert.equal(await gateway.clinicBookingOperation.count({ where: { conversationId: guest.conversation.id } }), 0);
  });
  await t.test('outage, reconstruction and repeated options keep one durable operation', async () => {
    const f = await fixture(), dto = { clientKey: randomUUID(), serviceId: f.service.id };
    const [a,b] = await Promise.all([slots.options(f.session.token, f.portalToken, dto), slots.options(f.session.token, f.portalToken, dto)]);
    assert.equal(a.id,b.id); assert.equal(a.status, 'PENDING');
    await assert.rejects(slots.options(f.session.token, f.portalToken, { ...dto, days: 3 }), /Ключ/);
    const offline = worker(); offline.gateway = async () => { throw new Error('offline'); };
    assert.equal((await offline.syncNow()).status, 'unavailable');
    assert.equal((await slots.read(f.session.token, f.portalToken, a.id)).status, 'PENDING');
    assert.equal((await worker().syncNow()).status, 'synced');
    assert.equal((await slots.read(f.session.token, f.portalToken, a.id)).status, 'DONE');
    assert.equal(await gateway.clinicBookingOperation.count({ where: { conversationId: f.session.conversation.id } }), 1);
  });
  await t.test('confirmation must use own returned pet and offer with both consents', async () => {
    const f = await fixture(), other = await fixture(), result = await options(f), dto = confirmation(f,result);
    await assert.rejects(slots.confirm(f.session.token, f.portalToken, { ...dto, contactConsent: false }), /согласие/);
    await assert.rejects(slots.confirm(f.session.token, f.portalToken, { ...dto, animalId: other.animal.id }), /своего чата/);
    await assert.rejects(slots.confirm(f.session.token, f.portalToken, { ...dto, offerToken: 'forged' }), /своего чата/);
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 0);
  });
  await t.test('lost result after commit, two workers and replay make one appointment and one confirmation', async () => {
    const f = await fixture(), result = await options(f), dto = confirmation(f, result);
    const [a,b] = await Promise.all([slots.confirm(f.session.token, f.portalToken, dto), slots.confirm(f.session.token, f.portalToken, dto)]); assert.equal(a.id,b.id);
    await assert.rejects(slots.confirm(f.session.token, f.portalToken, { ...dto, clientKey: randomUUID() }), /ещё проверяется|уже подтвержд/);
    const broken = worker(); const route = broken.gateway;
    broken.gateway = async (path, body) => { if (body?.status === 'DONE') throw new Error('lost ACK'); return route(path, body); };
    assert.equal((await broken.syncNow()).status, 'unavailable');
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 1);
    // Simulate confirmation arriving through the original CRM outbox before operation ACK.
    const request = await db.onlineAppointmentRequest.findFirstOrThrow({ where: { ownerId: f.owner.id } });
    const job = (await sync.jobs(request.id))[0]; await chat.command(f.session.conversation.id, { ...job.payload, crmRequestId: request.id });
    assert.equal((await chat.read(f.session.token)).mode, 'ASSISTANT');
    await chat.command(f.session.conversation.id, { clientKey: randomUUID(), action: 'REPLY', text: 'Администратор взял беседу после записи' });
    await Promise.all([worker().syncNow(), worker().syncNow()]);
    const done = await slots.read(f.session.token, f.portalToken, a.id); assert.equal(done.status, 'DONE'); assert.equal(done.result.appointmentId, request.appointmentId);
    assert.equal((await chat.read(f.session.token)).mode, 'HUMAN');
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 1);
    assert.equal(await db.auditLog.count({ where: { entityId: request.id, action: 'assistant_booking.confirm' } }), 1);
    assert.equal((await chat.read(f.session.token)).messages.filter(x => x.clientKey === job.payload.clientKey).length, 1);
    const imported = await sync.importConversation(await chat.read(f.session.token)); assert.equal(imported.id, request.id); assert.equal(imported.status, 'ACCEPTED');
    assert.equal(await db.onlineAppointmentRequest.count({ where: { ownerId: f.owner.id } }), 1);
    await assert.rejects(slots.confirm(f.session.token, f.portalToken, { ...dto, comment: 'different' }), /Ключ/);
  });
  await t.test('human takeover before processing prevents a new booking', async () => {
    const f = await fixture(), result = await options(f), operation = await slots.confirm(f.session.token, f.portalToken, confirmation(f,result));
    await chat.command(f.session.conversation.id, { clientKey: randomUUID(), action: 'REPLY', text: 'С вами администратор' });
    await worker().syncNow();
    assert.equal((await slots.read(f.session.token, f.portalToken, operation.id)).status, 'FAILED');
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 0);
  });
  await t.test('a changed rule rejects the queued offer and a new option search can recover', async () => {
    const f = await fixture(), result = await options(f), operation = await slots.confirm(f.session.token, f.portalToken, confirmation(f,result));
    await booking.disableRule(f.rule.id, f.doctor.id); await worker().syncNow();
    const failed = await slots.read(f.session.token, f.portalToken, operation.id); assert.equal(failed.status, 'FAILED'); assert.match(failed.error, /Правила/);
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 0);
    const pending = await slots.options(f.session.token, f.portalToken, { clientKey: randomUUID(), serviceId: f.service.id });
    await worker().syncNow(); assert.equal((await slots.read(f.session.token, f.portalToken, pending.id)).result.offers.length, 0);
  });
  await t.test('dialog service ambiguity, explicit dates and genuine slots use the same durable booking path', async () => {
    const f = await fixture(), label = `Диалог${randomUUID().slice(0, 8)}`;
    await db.service.update({ where: { id: f.service.id }, data: { title: `${label} — первичный приём` } });
    const second = await db.service.create({ data: { title: `${label} — повторный приём`, isActive: true, publicOnWebsite: true } });
    const secondRule = await booking.saveRule({ officeId: f.rule.officeId, roomId: f.rule.roomId, employeeId: f.doctor.id, serviceId: second.id, isActive: true, durationMinutes: 30, stepMinutes: 15, minimumLeadMinutes: 0, maximumDaysAhead: 2 }, f.doctor.id); rules.push(secondRule.id);
    const ambiguous = await slots.options(f.session.token, f.portalToken, { clientKey: randomUUID(), serviceQuery: label, days: 2 });
    await worker().syncNow();
    const choices = (await slots.read(f.session.token, f.portalToken, ambiguous.id)).result;
    assert.equal(choices.selection.serviceState, 'CHOOSE'); assert.equal(choices.offers.length, 0); assert.equal(choices.services.length, 2);
    const unclear = await slots.options(f.session.token, f.portalToken, { clientKey: randomUUID(), serviceId: f.service.id, preferredTimeText: 'на следующей неделе' });
    await worker().syncNow(); const clarification = (await slots.read(f.session.token, f.portalToken, unclear.id)).result;
    assert.equal(clarification.selection.dateState, 'CLARIFY'); assert.equal(clarification.offers.length, 0);
    const baseline = await booking.options({ ownerId: f.owner.id, serviceId: f.service.id, days: 2 });
    const at = new Date(baseline.offers[0].startsAt);
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
    const operation = await slots.options(f.session.token, f.portalToken, { clientKey: randomUUID(), serviceId: f.service.id, date });
    await worker().syncNow(); const resolved = await slots.read(f.session.token, f.portalToken, operation.id);
    assert.ok(resolved.result.offers.length);
    assert.ok(resolved.result.offers.every(o => o.serviceId === f.service.id && new Intl.DateTimeFormat('sv-SE', { timeZone: o.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(o.startsAt)) === date));
    const confirmationOp = await slots.confirm(f.session.token, f.portalToken, confirmation(f, resolved)); await worker().syncNow();
    assert.equal((await slots.read(f.session.token, f.portalToken, confirmationOp.id)).status, 'DONE');
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 1);
  });
  await t.test('new dialog revisions invalidate late choices and never override clinical handoff', async () => {
    const f = await fixture();
    await chat.message(f.session.token, { clientKey: randomUUID(), text: 'Хочу записаться на осмотр завтра' });
    const first = (await chat.read(f.session.token)).bookingDraft;
    assert.equal(first.serviceQuery, 'осмотр'); assert.equal(first.preferredTimeText, 'завтра');
    const pending = await slots.options(f.session.token, f.portalToken, { clientKey: randomUUID(), serviceId: f.service.id, draftRevision: first.revision });
    await chat.message(f.session.token, { clientKey: randomUUID(), text: 'лучше послезавтра' });
    const next = (await chat.read(f.session.token)).bookingDraft;
    assert.equal(next.preferredTimeText, 'послезавтра'); assert.equal(next.serviceQuery, 'осмотр');
    await chat.message(f.session.token, { clientKey: randomUUID(), text: 'Первичный приём' });
    const withService = await chat.read(f.session.token);
    assert.equal(withService.mode, 'ASSISTANT'); assert.equal(withService.bookingDraft.serviceQuery, 'Первичный приём');
    // Continue assertions with the latest service/date revision.
    Object.assign(next, withService.bookingDraft);
    await worker().syncNow();
    assert.equal((await slots.read(f.session.token, f.portalToken, pending.id)).status, 'FAILED');
    await assert.rejects(slots.options(f.session.token, f.portalToken, { clientKey: randomUUID(), draftRevision: first.revision }), /Условия/);
    const op = await slots.options(f.session.token, f.portalToken, { clientKey: randomUUID(), serviceId: f.service.id, draftRevision: next.revision });
    await worker().syncNow(); const choices = await slots.read(f.session.token, f.portalToken, op.id);
    const count = (await chat.read(f.session.token)).messages.filter(m => m.clientKey === `options-result:${op.id}`).length;
    await slots.complete(op.id, { status: 'DONE', result: choices.result });
    assert.equal((await chat.read(f.session.token)).messages.filter(m => m.clientKey === `options-result:${op.id}`).length, count); assert.equal(count, 1);
    await chat.message(f.session.token, { clientKey: randomUUID(), text: 'сегодня' });
    await assert.rejects(slots.confirm(f.session.token, f.portalToken, confirmation(f, choices)), /Условия/);
    await chat.message(f.session.token, { clientKey: randomUUID(), text: 'после вакцинации рвота, можно завтра?' });
    assert.equal((await chat.read(f.session.token)).mode, 'HUMAN');
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 0);
  });
});
