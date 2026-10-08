import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { withinOfficeHours } from '../apps/api/dist/modules/online-requests/assistant-booking-hours.js';
import { AssistantBookingController } from '../apps/api/dist/modules/online-requests/assistant-booking.controller.js';

const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, {
  isWorking: true, opensAt: '09:00', closesAt: '18:00', breakStart: '12:00', breakEnd: '13:00',
}]));
const allows = (start, end, config = hours, zone = 'Europe/Moscow') => withinOfficeHours(new Date(start), new Date(end), zone, config);

test('autobooking hours respect local time, whole intervals, closing and breaks', () => {
  assert.equal(allows('2026-10-08T06:00:00Z', '2026-10-08T06:30:00Z'), true);
  assert.equal(allows('2026-10-08T05:45:00Z', '2026-10-08T06:15:00Z'), false);
  assert.equal(allows('2026-10-08T08:45:00Z', '2026-10-08T09:15:00Z'), false);
  assert.equal(allows('2026-10-08T14:30:00Z', '2026-10-08T15:00:00Z'), true);
  assert.equal(allows('2026-10-08T14:30:30Z', '2026-10-08T15:00:30Z'), false);
  assert.equal(allows('2026-10-08T15:00:00Z', '2026-10-08T15:30:00Z'), false);
});
test('autobooking never invents missing or malformed hours', () => {
  for (const config of [null, {}, [], { thursday: { isWorking: true } }, { thursday: { ...hours.thursday, breakEnd: 'bad' } }]) {
    assert.equal(allows('2026-10-08T06:00:00Z', '2026-10-08T06:30:00Z', config), false);
  }
  assert.equal(allows('2026-10-08T06:00:00Z', '2026-10-08T06:30:00Z', hours, 'Unknown/City'), false);
  assert.equal(allows('2026-10-08T06:00:00Z', '2026-10-08T06:00:00Z'), false);
});
test('autobooking covers overnight shifts and real daylight-saving clock changes', () => {
  const overnight = { thursday: { isWorking: true, opensAt: '22:00', closesAt: '02:00' } };
  assert.equal(allows('2026-10-08T22:30:00Z', '2026-10-08T23:00:00Z', overnight), true);
  assert.equal(allows('2026-10-08T22:45:00Z', '2026-10-08T23:15:00Z', overnight), false);
  const spring = { sunday: { isWorking: true, opensAt: '01:00', closesAt: '04:00' } };
  assert.equal(allows('2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z', spring, 'America/New_York'), true);
  // 01:30 -> 01:00 -> 01:30 on the fall-back night: the closed minute is occupied.
  const fall = { sunday: { isWorking: true, opensAt: '01:15', closesAt: '02:00' } };
  assert.equal(allows('2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', fall, 'America/New_York'), false);
});
test('autobooking bridge endpoints require the dedicated shared secret', () => {
  const old = process.env.OWNER_GATEWAY_SYNC_SECRET;
  process.env.OWNER_GATEWAY_SYNC_SECRET = 'synthetic-autobooking-secret-20261008';
  try {
    const controller = new AssistantBookingController({ assertEnabled() {}, options: value => value, book: value => value });
    for (const secret of [undefined, '', 'wrong-secret', `${process.env.OWNER_GATEWAY_SYNC_SECRET}x`]) assert.throws(() => controller.options(secret, {}), /Недоступная/);
    assert.deepEqual(controller.options(process.env.OWNER_GATEWAY_SYNC_SECRET, { ownerId: randomUUID() }).ownerId.length, 36);
    assert.throws(() => controller.confirm('wrong-secret', {}), /Недоступная/);
  } finally { if (old === undefined) delete process.env.OWNER_GATEWAY_SYNC_SECRET; else process.env.OWNER_GATEWAY_SYNC_SECRET = old; }
});

test('isolated PostgreSQL: assistant books only verified, current, conflict-free appointments', { skip: !process.env.ASSISTANT_TEST_DATABASE_URL }, async t => {
  const url = process.env.ASSISTANT_TEST_DATABASE_URL;
  const parsed = new URL(url);
  assert.ok(parsed.hostname === '127.0.0.1' && parsed.port === '15488' && parsed.pathname === '/crm_assistant_qa');
  const { PrismaClient } = await import('@prisma/client');
  const { AssistantBookingService } = await import('../apps/api/dist/modules/online-requests/assistant-booking.service.js');
  const { AppointmentsService } = await import('../apps/api/dist/modules/appointments/appointments.service.js');
  const { AuditService } = await import('../apps/api/dist/modules/audit/audit.service.js');
  const { SchedulingService } = await import('../apps/api/dist/modules/scheduling/scheduling.service.js');
  const { ClinicConversationSyncService } = await import('../apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js');
  const { OnlineRequestAttentionService } = await import('../apps/api/dist/modules/online-requests/online-request-attention.service.js');
  process.env.CLINIC_ASSISTANT_ENABLED = 'true';
  process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED = 'true';
  process.env.CLINIC_ASSISTANT_BOOKING_SIGNING_SECRET = 'synthetic-offer-signing-secret-only-20261008';
  const db = new PrismaClient({ datasources: { db: { url } } });
  const requestIds = [];
  t.after(async () => {
    // These providerless fixtures must never be dispatched by the live QA sync loop.
    if (requestIds.length) await db.backgroundJob.updateMany({ where: { queueName: 'clinic-conversation', OR: requestIds.map(id => ({ payload: { path: ['requestId'], equals: id } })) }, data: { status: 'DONE' } });
    await db.$disconnect();
  });
  const audit = new AuditService(db), appointments = new AppointmentsService(db, audit, new SchedulingService(db, audit));
  const sync = new ClinicConversationSyncService(db), assistant = new AssistantBookingService(db, appointments, audit, sync);
  const attention = new OnlineRequestAttentionService(db);
  const now = new Date('2099-10-08T05:00:00Z');
  const doctorRole = await db.role.upsert({ where: { code: 'doctor' }, create: { code: 'doctor', title: 'QA doctor' }, update: {} });
  async function fixture() {
    const org = await db.organization.create({ data: { displayName: 'Synthetic autonomous booking QA' } });
    const office = await db.clinicOffice.create({ data: { organizationId: org.id, name: 'QA Samara office', timezone: 'Europe/Samara', workingHours: hours } });
    const room = await db.room.create({ data: { officeId: office.id, name: 'QA examination room' } });
    const owner = await db.owner.create({ data: { fullName: 'Synthetic owner', phone: '+79990000001' } });
    const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Synthetic cat' } });
    const employee = await db.employee.create({ data: { fullName: 'Synthetic doctor', roles: { create: { roleId: doctorRole.id } } } });
    const service = await db.service.create({ data: { title: 'Synthetic examination', isActive: true, publicOnWebsite: true } });
    const shift = await db.employeeShift.create({ data: { employeeId: employee.id, startsAt: new Date('2099-10-08T04:00:00Z'), endsAt: new Date('2099-10-08T15:00:00Z') } });
    const rule = await assistant.saveRule({ officeId: office.id, roomId: room.id, employeeId: employee.id, serviceId: service.id, isActive: true, durationMinutes: 30, stepMinutes: 15, minimumLeadMinutes: 30, maximumDaysAhead: 2 }, employee.id);
    const options = () => assistant.options({ ownerId: owner.id, serviceId: service.id, days: 1 }, now);
    const input = offer => ({ ownerId: owner.id, animalId: animal.id, conversationId: randomUUID(), bookingSequence: 1, clientKey: randomUUID(), offerToken: offer.offerToken, contactConsent: true, appointmentConsent: true });
    const book = async (value, at = now) => { const result = await assistant.book(value, at); requestIds.push(result.requestId); return result; };
    return { office, room, owner, animal, employee, service, shift, rule, options, input, book };
  }
  await t.test('offers respect lead time, local hours, breaks, shifts, existing bookings and owner identity', async () => {
    const f = await fixture();
    await appointments.createAppointment({ ownerId: f.owner.id, animalId: f.animal.id, employeeId: f.employee.id, roomId: f.room.id, officeId: f.office.id, startsAt: '2099-10-08T06:00:00Z', endsAt: '2099-10-08T06:30:00Z' }, f.employee.id);
    const options = await f.options();
    assert.equal(options.animals[0].id, f.animal.id);
    assert.ok(options.offers.length > 0);
    for (const offer of options.offers) {
      assert.equal(offer.timezone, 'Europe/Samara');
      assert.ok(new Date(offer.startsAt) >= new Date('2099-10-08T05:30:00Z'));
      assert.equal(allows(offer.startsAt, offer.endsAt, hours, 'Europe/Samara'), true);
      assert.ok(!(offer.startsAt < '2099-10-08T06:30:00.000Z' && offer.endsAt > '2099-10-08T06:00:00.000Z'));
    }
    await assert.rejects(assistant.options({ ownerId: randomUUID() }, now), /личный кабинет/);
    await db.service.update({ where: { id: f.service.id }, data: { publicOnWebsite: false } });
    assert.equal((await f.options()).offers.length, 0);
  });
  await t.test('concurrent identical confirmation and an expired retry create one appointment, one audit and one message', async () => {
    const f = await fixture(), input = f.input((await f.options()).offers[0]);
    const [a, b] = await Promise.all([f.book(input), f.book(input)]);
    assert.equal(a.appointmentId, b.appointmentId);
    assert.equal((await f.book(input, new Date(now.getTime() + 10 * 60000))).appointmentId, a.appointmentId);
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 1);
    assert.equal(await db.auditLog.count({ where: { entityId: a.requestId, action: 'assistant_booking.confirm' } }), 1);
    const jobs = await db.backgroundJob.findMany({ where: { queueName: 'clinic-conversation', payload: { path: ['requestId'], equals: a.requestId } } });
    assert.equal(jobs.length, 1);
    assert.match(jobs[0].payload.text, /09:30/);
    assert.match(jobs[0].payload.text, /Europe\/Samara/);
    assert.doesNotMatch(jobs[0].payload.text, /московское время/);
  });
  await t.test('a different key or different slot cannot book the same conversation episode twice', async () => {
    const f = await fixture(), offers = (await f.options()).offers;
    const input = f.input(offers[0]); await f.book(input);
    await assert.rejects(f.book({ ...input, clientKey: randomUUID(), offerToken: offers[3].offerToken }), /уже записано/);
    await assert.rejects(f.book({ ...input, comment: 'different operation' }), /Ключ подтверждения/);
    const next = await f.book({ ...input, bookingSequence: 5, clientKey: randomUUID(), offerToken: offers[3].offerToken });
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 2);
    assert.ok(next.appointmentId);
  });
  await t.test('two owners competing for one slot have one winner and the loser leaves no request', async () => {
    const f = await fixture();
    const owner = await db.owner.create({ data: { fullName: 'Synthetic competing owner' } });
    const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Synthetic dog' } });
    const mine = (await f.options()).offers[0];
    const other = (await assistant.options({ ownerId: owner.id, serviceId: f.service.id, days: 1 }, now)).offers.find(x => x.startsAt === mine.startsAt);
    const results = await Promise.allSettled([f.book(f.input(mine)), f.book({ ...f.input(other), ownerId: owner.id, animalId: animal.id })]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.match(results.find(x => x.status === 'rejected').reason.message, /уже занят/);
    assert.equal(await db.onlineAppointmentRequest.count({ where: { ownerId: { in: [f.owner.id, owner.id] } } }), 1);
  });
  await t.test('manual booking competes atomically with assistant booking', async () => {
    const f = await fixture(), offer = (await f.options()).offers[0];
    const results = await Promise.allSettled([f.book(f.input(offer)), appointments.createAppointment({ ownerId: f.owner.id, animalId: f.animal.id, employeeId: f.employee.id, roomId: f.room.id, officeId: f.office.id, startsAt: offer.startsAt, endsAt: offer.endsAt }, f.employee.id)]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 1);
  });
  await t.test('stale, forged, expired and cross-owner offers fail without writing a request', async () => {
    const f = await fixture(), input = f.input((await f.options()).offers[0]);
    await assert.rejects(f.book({ ...input, offerToken: `A${input.offerToken.slice(1)}` }), /подтверждено CRM/);
    await assert.rejects(f.book(input, new Date(now.getTime() + 5 * 60000)), /истекло/);
    await assert.rejects(f.book({ ...input, ownerId: randomUUID() }), /истекло/);
    await assistant.disableRule(f.rule.id, f.employee.id);
    await assert.rejects(f.book(input), /Правила записи изменились/);
    assert.equal(await db.onlineAppointmentRequest.count({ where: { ownerId: f.owner.id } }), 0);
  });
  await t.test('changed shift, hidden service, archived pet and another owner pet are rechecked at confirmation', async () => {
    const f = await fixture(), input = f.input((await f.options()).offers[0]);
    await db.employeeShift.update({ where: { id: f.shift.id }, data: { isActive: false } });
    await assert.rejects(f.book(input), /Смена врача/);
    await db.employeeShift.update({ where: { id: f.shift.id }, data: { isActive: true } });
    await db.service.update({ where: { id: f.service.id }, data: { publicOnWebsite: false } });
    await assert.rejects(f.book(input), /Правила записи/);
    await db.service.update({ where: { id: f.service.id }, data: { publicOnWebsite: true } });
    await db.animal.update({ where: { id: f.animal.id }, data: { archivedAt: now } });
    await assert.rejects(f.book(input), /своего личного кабинета/);
    await db.animal.update({ where: { id: f.animal.id }, data: { archivedAt: null } });
    const owner = await db.owner.create({ data: { fullName: 'Unrelated synthetic owner' } });
    const pet = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Unrelated synthetic pet' } });
    await assert.rejects(f.book({ ...input, animalId: pet.id }), /своего личного кабинета/);
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 0);
  });
  await t.test('taking the request by an administrator suppresses automatic confirmation', async () => {
    const f = await fixture(), input = f.input((await f.options()).offers[0]);
    const request = await db.onlineAppointmentRequest.create({ data: { conversationId: input.conversationId, ownerId: f.owner.id, ownerName: 'QA', phone: 'chat', animalNickname: 'QA', conversationSnapshot: { bookingSequence: 1 } } });
    await attention.claim(request.id, f.employee.id);
    await assert.rejects(f.book(input), /обрабатывает администратор/);
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 0);
  });
  await t.test('CRM conversation import after automatic confirmation preserves the accepted episode', async () => {
    const f = await fixture(), input = f.input((await f.options()).offers[0]);
    const result = await f.book(input);
    const snapshot = { id: input.conversationId, sequence: 3, bookingSequence: 1, source: 'SITE_CHAT', mode: 'ASSISTANT', ownerId: f.owner.id, contactName: 'QA', phone: null, animalNickname: 'QA', preferredAt: null, contactConsent: true, needsAttention: false, maxUserId: null, messages: [] };
    const imported = await sync.importConversation(snapshot);
    assert.equal(imported.id, result.requestId); assert.equal(imported.status, 'ACCEPTED');
    assert.equal(imported.appointmentId, result.appointmentId);
    assert.equal(await db.onlineAppointmentRequest.count({ where: { conversationId: input.conversationId } }), 1);
    await db.appointment.update({ where: { id: result.appointmentId }, data: { status: 'CANCELLED' } });
    assert.equal((await f.book(input)).status, 'CANCELLED');
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 1);
  });
  await t.test('missing consent, configuration and timezone never silently confirm', async () => {
    const f = await fixture(), input = f.input((await f.options()).offers[0]);
    await assert.rejects(f.book({ ...input, appointmentConsent: false }), /Подтвердите/);
    await assert.rejects(assistant.options({ ownerId: f.owner.id, from: '2099-10-08T07:00:00' }, now), /часовой пояс/);
    process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED = 'false';
    await assert.rejects(f.book(input), /пока не включена/);
    process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED = 'true';
    const secret = process.env.CLINIC_ASSISTANT_BOOKING_SIGNING_SECRET; delete process.env.CLINIC_ASSISTANT_BOOKING_SIGNING_SECRET;
    await assert.rejects(f.options(), /Защита предложений/);
    process.env.CLINIC_ASSISTANT_BOOKING_SIGNING_SECRET = secret;
    assert.equal(await db.appointment.count({ where: { ownerId: f.owner.id } }), 0);
  });
});
