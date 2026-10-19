import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { groomingFixture, qaSecret } from './helpers/grooming-crm-fixture.mjs';
Object.assign(process.env, { NODE_ENV: 'test', GROOMING_BOOKING_SIGNING_SECRET: qaSecret, GROOMING_CRM_SYNC_ENABLED: 'true', GROOMING_CLIENT_NOTIFICATIONS_ENABLED: 'true', MAX_BOT_USERNAME: 'grooming-qa-bot' });
delete process.env.MAX_BOT_TOKEN; delete process.env.GROOMING_MAX_BOT_TOKEN;
const input = offer => ({ clientKey: randomUUID(), offerToken: offer.offerToken, notes: 'Тестовые пожелания', looks: ['poodle:classic'], contactConsent: true, bookingConsent: true });
const fixture = async (t) => { const f = await groomingFixture(); t.after(f.close); return f; };
const firstOffer = async f => (await f.service.options(f.owner.id, f.options)).offers[0];

test('own calendar works without clinic offices, clinical services or medical shifts', async t => {
  const f = await fixture(t);
  assert.equal(await f.prisma.clinicOffice.count(), 0);
  assert.equal(await f.prisma.employeeShift.count(), 0);
  assert.equal(await f.prisma.service.count(), 0);
  const result = await f.service.options(f.owner.id, f.options);
  assert.ok(result.offers.length > 10);
  assert.equal(result.offers[0].durationMinutes, 90);
  assert.equal(result.offers[0].bufferMinutes, 15);
  assert.equal(await f.prisma.appointment.count(), 0);
});
test('PostgreSQL rejects overlapping grooming reservations and shifts without the application lock', async t => {
  const f = await fixture(t), booking = await f.service.book(f.owner.id, input(await firstOffer(f)));
  const row = await f.prisma.groomingReservation.findUniqueOrThrow({ where: { id: booking.id } });
  await assert.rejects(f.prisma.groomingReservation.create({ data: { ...row, id: randomUUID(), ownerId: f.otherOwner.id, animalId: f.otherAnimal.id } }), /grooming_employee_no_overlap/);
  await assert.rejects(f.prisma.groomingReservation.create({ data: { ...row, id: randomUUID(), ownerId: f.otherOwner.id, animalId: f.otherAnimal.id, employeeId: f.otherGroomer.id } }), /grooming_workplace_no_overlap/);
  const shift = await f.prisma.groomingWorkPeriod.findFirstOrThrow({ where: { specialistId: f.specialist.id } });
  await assert.rejects(f.prisma.groomingWorkPeriod.create({ data: { ...shift, id: randomUUID() } }), /grooming_work_period_no_overlap/);
});
test('grooming notification switch is independent of medical reminders and respects quiet hours', async t => {
  const f = await fixture(t), now = new Date('2026-10-20T20:00:00Z');
  process.env.CLINIC_ASSISTANT_REMINDERS_ENABLED = 'false';
  await f.gateway.ownerNotificationPreference.update({ where: { ownerId: f.owner.id }, data: { timezone: 'Europe/Moscow', quietStartMinute: 22 * 60, quietEndMinute: 8 * 60 } });
  const dto = { ownerId: f.owner.id, kind: 'GROOMING_REMINDER', text: 'Синтетическое напоминание груминга', expiresAt: '2026-10-22T10:00:00Z' };
  const deferred = await f.notifications.deliver(randomUUID(), dto, now);
  assert.equal(deferred.status, 'DEFERRED'); assert.equal(deferred.retryAt, '2026-10-21T05:00:00.000Z');
  assert.equal(f.max.sent.length, 0);
  assert.equal((await f.notifications.deliver(randomUUID(), { ...dto, kind: 'APPOINTMENT_REMINDER' }, now)).status, 'DISABLED');
  assert.equal((await f.notifications.deliver(randomUUID(), dto, new Date(deferred.retryAt))).status, 'SENT');
  assert.equal(f.max.sent.length, 1); assert.equal(f.max.sent[0].destination, 'grooming');
});
test('clinic and grooming delivery budgets are independent when sharing the current MAX bot', async t => {
  const f = await fixture(t), now = new Date();
  const previous = Object.fromEntries(['CLINIC_ASSISTANT_REMINDERS_ENABLED', 'CLINIC_ASSISTANT_NOTIFICATION_DAILY_LIMIT', 'GROOMING_NOTIFICATION_DAILY_LIMIT'].map(key => [key, process.env[key]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  Object.assign(process.env, { CLINIC_ASSISTANT_REMINDERS_ENABLED: 'true', CLINIC_ASSISTANT_NOTIFICATION_DAILY_LIMIT: '1', GROOMING_NOTIFICATION_DAILY_LIMIT: '2' });
  const input = kind => ({ ownerId: f.owner.id, kind, text: 'Синтетическая проверка отдельных лимитов', expiresAt: new Date(now.getTime() + 86400000).toISOString() });
  assert.equal((await f.notifications.deliver(randomUUID(), input('APPOINTMENT_CHANGE'), now)).status, 'SENT');
  assert.equal((await f.notifications.deliver(randomUUID(), input('GROOMING_CHANGE'), now)).status, 'SENT');
  assert.equal((await f.notifications.deliver(randomUUID(), input('GROOMING_REMINDER'), now)).status, 'SENT');
  assert.equal((await f.notifications.deliver(randomUUID(), input('APPOINTMENT_REMINDER'), now)).status, 'DEFERRED');
  assert.equal((await f.notifications.deliver(randomUUID(), input('GROOMING_CHANGE'), now)).status, 'DEFERRED');
  assert.equal(f.max.sent.length, 3);
});
test('two clients competing for one interval produce exactly one reservation', async t => {
  const f = await fixture(t), a = await firstOffer(f);
  const b = (await f.service.options(f.otherOwner.id, { ...f.options, animalId: f.otherAnimal.id })).offers[0];
  const results = await Promise.allSettled([f.service.book(f.owner.id, input(a)), f.service.book(f.otherOwner.id, input(b))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await f.prisma.groomingReservation.count({ where: { ruleId: f.rule.id } }), 1);
});
test('manual booking and client booking share the same grooming availability', async t => {
  const f = await fixture(t), a = await firstOffer(f);
  const b = (await f.service.options(f.otherOwner.id, { ...f.options, animalId: f.otherAnimal.id }, new Date(), f.administrator)).offers[0];
  const results = await Promise.allSettled([f.service.book(f.owner.id, input(a)), f.service.book(f.otherOwner.id, input(b), new Date(), f.administrator)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
test('workplace and cleanup buffer cannot be booked by a second groomer', async t => {
  const f = await fixture(t), a = await firstOffer(f);
  await f.service.book(f.owner.id, input(a));
  const options = await f.service.options(f.otherOwner.id, { ...f.options, animalId: f.otherAnimal.id, specialistId: f.secondSpecialist.id });
  assert.ok(options.offers.every(o => o.startsAt >= a.blockedUntil));
});
test('same command is restored after response loss and expiry; changed command is rejected', async t => {
  const f = await fixture(t), offer = await firstOffer(f), dto = input(offer);
  const booking = await f.service.book(f.owner.id, dto);
  await f.prisma.clinicModuleInstallation.update({ where: { id: f.installation.id }, data: { enabled: false } });
  const replay = await f.service.book(f.owner.id, dto, new Date(Date.now() + 10 * 60000));
  assert.equal(replay.id, booking.id);
  await assert.rejects(f.service.book(f.owner.id, { ...dto, notes: 'Изменённый запрос' }), /Ключ записи/);
  assert.equal(await f.prisma.groomingReservation.count({ where: { ruleId: f.rule.id } }), 1);
});
test('offers are owner-bound; another pet and another groomer record are inaccessible', async t => {
  const f = await fixture(t), offer = await firstOffer(f);
  await assert.rejects(f.service.book(f.otherOwner.id, input(offer)), /Предложение истекло/);
  await assert.rejects(f.service.options(f.owner.id, { ...f.options, animalId: f.otherAnimal.id }), /своего питомца/);
  const booking = await f.service.book(f.owner.id, input(offer));
  assert.equal(booking.serviceId, f.groomingService.id);
  await assert.rejects(f.service.booking(booking.id, f.otherGroomer), /не найдена/);
  await assert.rejects(f.service.status(booking.id, f.otherOwner.id, { clientKey: randomUUID(), version: 1 }), /не найдена/);
});
test('failed reschedule preserves the old booking; successful reschedule cancels old reminders', async t => {
  const f = await fixture(t), offers = (await f.service.options(f.owner.id, f.options)).offers;
  const booked = await f.service.book(f.owner.id, input(offers[0]));
  const moves = (await f.service.options(f.owner.id, { ...f.options, reservationId: booked.id })).offers;
  const target = moves.find(o => o.startsAt >= booked.blockedUntil);
  const competitor = (await f.service.options(f.otherOwner.id, { ...f.options, animalId: f.otherAnimal.id })).offers.find(o => o.startsAt === target.startsAt);
  await f.service.book(f.otherOwner.id, input(competitor));
  await assert.rejects(f.service.book(f.owner.id, input(target), new Date(), undefined, { id: booked.id, version: 1 }), /занято/);
  assert.equal((await f.prisma.groomingReservation.findUnique({ where: { id: booked.id } })).startsAt.toISOString(), booked.startsAt);
  const fresh = (await f.service.options(f.owner.id, { ...f.options, reservationId: booked.id })).offers.find(o => o.startsAt > competitor.blockedUntil);
  const moved = await f.service.book(f.owner.id, input(fresh), new Date(), undefined, { id: booked.id, version: 1 });
  assert.equal(moved.version, 2);
  assert.equal(await f.prisma.groomingNotification.count({ where: { reservationId: booked.id, reservationVersion: 1, status: 'QUEUED' } }), 0);
  assert.ok(await f.prisma.groomingNotification.count({ where: { reservationId: booked.id, reservationVersion: 2, event: 'REMINDER' } }));
});
test('own breaks invalidate offers and work periods with confirmed bookings cannot be removed', async t => {
  const f = await fixture(t), offer = await firstOffer(f);
  await f.service.saveShift({ employeeId: f.groomer.id, locationId: f.location.id, kind: 'BLOCK', startsAt: offer.startsAt, endsAt: offer.blockedUntil, comment: 'Перерыв', isActive: true }, f.administrator);
  await assert.rejects(f.service.book(f.owner.id, input(offer)), /занято/);
  const next = await firstOffer(f), booked = await f.service.book(f.owner.id, input(next));
  const shift = await f.prisma.groomingWorkPeriod.findFirst({ where: { specialistId: f.specialist.id, kind: 'WORK', startsAt: { lte: new Date(booked.startsAt) }, endsAt: { gte: new Date(booked.blockedUntil) } } });
  await assert.rejects(f.service.saveShift({ employeeId: f.groomer.id, locationId: f.location.id, kind: 'WORK', startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString(), comment: '', isActive: false, version: shift.version }, f.administrator, shift.id), /будущую запись/);
});
test('licence, module switch and price changes are rechecked before confirmation', async t => {
  const f = await fixture(t), offer = await firstOffer(f);
  f.license.enforcementActive = true; f.license.status = 'VALID'; f.license.features = [];
  await assert.rejects(f.service.book(f.owner.id, input(offer)), /лицензии/);
  f.license.features = ['GROOMING'];
  await f.service.saveService({ title: f.groomingService.title, price: 2700, version: f.groomingService.version, isActive: true }, f.director, f.groomingService.id);
  await assert.rejects(f.service.book(f.owner.id, input(offer)), /Условия услуги/);
  const fresh = await firstOffer(f);
  await f.modules.setEnabled('GROOMING', false, (await f.modules.installation('GROOMING')).version, f.director.id);
  await assert.rejects(f.service.book(f.owner.id, input(fresh)), /отключён/);
});
test('cat care uses its own duration; reminders are not sent after cancellation', async t => {
  const f = await fixture(t), offer = (await f.service.options(f.owner.id, { ...f.options, animalId: f.cat.id, species: 'CAT', size: 'ANY' })).offers[0];
  assert.equal(offer.durationMinutes, 60);
  const booking = await f.service.book(f.owner.id, input(offer));
  await f.service.status(booking.id, f.owner.id, { clientKey: randomUUID(), version: booking.version });
  assert.equal(await f.prisma.groomingNotification.count({ where: { reservationId: booking.id, event: 'REMINDER', status: 'QUEUED' } }), 0);
  assert.equal((await f.service.portalState(f.owner.id)).bookings.find(b => b.id === booking.id).status, 'CANCELLED');
});
test('durable portal queue is session scoped, idempotent and recovers by key', async t => {
  const f = await fixture(t), request = { clientKey: randomUUID(), kind: 'STATE', input: {} };
  const a = await f.portal.operation(f.sessionToken, request), b = await f.portal.operation(f.sessionToken, request);
  assert.equal(a.id, b.id);
  assert.equal((await f.portal.byKey(f.sessionToken, request.clientKey)).id, a.id);
  await assert.rejects(f.portal.operation(f.sessionToken, { ...request, kind: 'OPTIONS' }), /Ключ операции/);
  const result = await f.sync.execute({ id: a.id, ownerId: f.owner.id, kind: 'STATE', input: {}, expiresAt: new Date(Date.now() + 60000).toISOString() });
  await f.portal.complete(a.id, { status: 'DONE', result: JSON.parse(JSON.stringify(result)) });
  assert.equal((await f.portal.result(f.sessionToken, a.id)).status, 'DONE');
  await assert.rejects(f.portal.result('invalid-session', a.id), /Войдите/);
});
test('MAX onboarding needs a verified challenge and never links an existing owner by phone', async t => {
  const f = await fixture(t), begin = await f.portal.beginRegistration('test-' + randomUUID());
  assert.equal((await f.portal.registrationStatus(begin.browserToken)).status, 'WAITING_MAX');
  await assert.rejects(f.portal.consumeRegistration(begin.browserToken), /Подождите/);
  const payload = new URL(begin.url).searchParams.get('start'), maxUserId = '88' + String(Date.now());
  await f.portal.bindMax(payload, maxUserId);
  let queued = (await f.portal.pendingRegistrations()).items.find(x => x.maxUserId === maxUserId);
  await f.portal.completeRegistration(queued.id, { result: await f.service.register(queued.id, maxUserId, queued.input) });
  assert.equal((await f.portal.registrationStatus(begin.browserToken)).status, 'NEEDS_DETAILS');
  await f.portal.registrationDetails(begin.browserToken, { fullName: 'Новый тестовый клиент', phone: f.owner.phone, contactConsent: true });
  queued = (await f.portal.pendingRegistrations()).items.find(x => x.maxUserId === maxUserId);
  const result = await f.service.register(queued.id, maxUserId, queued.input);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  await f.portal.completeRegistration(queued.id, { result });
  await assert.rejects(f.portal.consumeRegistration(begin.browserToken), /Подождите/);
});
test('new MAX client gets one cabinet; client notifications use current bot with deduplication', async t => {
  const f = await fixture(t), begin = await f.portal.beginRegistration('test-' + randomUUID()), maxUserId = '77' + String(Date.now());
  await f.portal.bindMax(new URL(begin.url).searchParams.get('start'), maxUserId);
  let queued = (await f.portal.pendingRegistrations()).items.find(x => x.maxUserId === maxUserId);
  await f.portal.completeRegistration(queued.id, { result: await f.service.register(queued.id, maxUserId, queued.input) });
  await f.portal.registrationDetails(begin.browserToken, { fullName: 'Клиент для проверки регистрации', phone: '+7999' + String(Date.now()).slice(-7), contactConsent: true });
  queued = (await f.portal.pendingRegistrations()).items.find(x => x.maxUserId === maxUserId);
  const result = await f.service.register(queued.id, maxUserId, queued.input);
  assert.equal(result.status, 'READY');
  assert.equal((await f.service.register(queued.id, maxUserId, queued.input)).ownerId, result.ownerId);
  await f.portal.completeRegistration(queued.id, { result });
  const session = await f.portal.consumeRegistration(begin.browserToken);
  assert.ok(session.sessionToken); await assert.rejects(f.portal.consumeRegistration(begin.browserToken), /истёк/);
  const id = randomUUID(), delivery = { recipientKind: 'OWNER', recipientId: f.owner.id, kind: 'GROOMING_CHANGE', text: 'Тестовое подтверждение груминга', expiresAt: new Date(Date.now() + 3600000).toISOString() };
  assert.equal((await f.portal.deliver(id, delivery)).status, 'SENT');
  assert.equal((await f.portal.deliver(id, delivery)).status, 'SENT');
  assert.equal(f.max.sent.length, 1); assert.equal(f.max.sent[0].destination, 'grooming');
  await f.notifications.unsubscribe(f.sessionToken);
  assert.equal((await f.portal.deliver(randomUUID(), delivery)).status, 'NO_CONSENT');
});
test('lost MAX provider answer is uncertain and is never resent blindly', async t => {
  const f = await fixture(t); f.max.fail = true;
  const id = randomUUID(), delivery = { recipientKind: 'STAFF', recipientId: '990000001', kind: 'GROOMING_CHANGE', text: 'Тестовый ответ с потерей подтверждения', expiresAt: new Date(Date.now() + 3600000).toISOString() };
  assert.equal((await f.portal.deliver(id, delivery)).status, 'UNKNOWN');
  assert.equal((await f.portal.deliver(id, delivery)).status, 'UNKNOWN');
  assert.equal(f.max.sent.length, 1);
});
