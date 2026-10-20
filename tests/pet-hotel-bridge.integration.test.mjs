import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { configureIntegratedHotel, prepareIntegratedHotelDb, integratedHotelFixture, integratedGateway, hotelOperation, integratedPassword } from './helpers/pet-hotel-integrated-qa.mjs';
const require = createRequire(import.meta.url), names = configureIntegratedHotel();
const rejects = (p, status) => assert.rejects(p, e => e.getStatus?.() === status);

test('real hotel bridge: site selection, shared identity, clinical persistence, races, receipts and notifications', { timeout: 180000 }, async t => {
  await prepareIntegratedHotelDb(names);
  const f = await integratedHotelFixture(names); let g;
  t.after(async () => { await g?.close(); await f.close(); });
  await f.app.listen(0, '127.0.0.1');
  g = await integratedGateway(names);
  process.env.PET_HOTEL_CRM_SYNC_ENABLED = 'true';
  const [owner, other] = f.owners, cookies = [await g.ownerCookie(owner), await g.ownerCookie(other)];
  const request = async (path, body, cookie = cookies[0], origin = g.origin) => {
    const r = await fetch(g.origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { origin, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    let data; try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data, headers: r.headers };
  };
  const command = (kind, input, ownerId = owner.id) => hotelOperation(ownerId, kind, input);
  const selection = (offset = 3, extra = {}) => {
    const day = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10), start = new Date(day + 'T10:00:00+03:00');
    return { animalId: owner.animal.id, species: 'CAT', startsAt: start.toISOString(), endsAt: new Date(+start + 51 * 3600000).toISOString(), walkCount: 0, ...extra };
  };
  const bookInput = (offer, animalId = owner.animal.id) => ({ animalId, offerToken: offer.offerToken, notes: 'Только синтетическая проверка', contactConsent: true, bookingConsent: true });
  const queue = async (kind, input, cookie = cookies[0], clientKey = randomUUID()) => {
    const r = await request('/v1/portal/pet-hotel/operations', { clientKey, kind, input }, cookie);
    assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data;
  };
  const settled = async operation => { await f.sync.syncNow(); const r = await request('/v1/portal/pet-hotel/operations/' + operation.id); assert.equal(r.data.status, 'DONE', JSON.stringify(r.data)); return r.data.result; };
  const clinicalBefore = await Promise.all([f.prisma.appointment.count(), f.prisma.visit.count(), f.prisma.bill.count(), f.prisma.payment.count(), f.prisma.groomingReservation.count()]);
  let saved, originalBook, firstOffer;

  await t.test('real storefront source has the configured 8+4 rooms, individual rates and no owner data', async () => {
    const room = f.rooms.find(r => r.code === 'CAT-2');
    await f.hotel.saveRoom({ ...room, dailyRate: 900.25 }, f.staff.director, room.id);
    await f.sync.syncNow();
    const catalog = await request('/v1/public/pet-hotel/catalog');
    assert.equal(catalog.status, 200); assert.equal(catalog.data.rooms.length, 12); assert.equal(catalog.data.testMode, true);
    assert.equal(catalog.data.rooms.find(r => r.code === 'CAT-2').dailyRate, '900.25');
    assert.equal(catalog.data.rooms.filter(r => r.species === 'CAT').length, 8); assert.equal(catalog.data.rooms.filter(r => r.species === 'DOG').length, 4);
    assert.ok(!JSON.stringify(catalog.data).includes(owner.id)); assert.equal(catalog.data.selfBookingEnabled, true);
  });
  await t.test('website offer and draft reach the shared owner account and then a real clinical booking', async () => {
    const s = selection(), publicQuery = new URLSearchParams({ species: 'CAT', startsAt: s.startsAt, endsAt: s.endsAt, walkCount: '0' });
    const publicOffers = await request('/v1/public/pet-hotel/availability?' + publicQuery);
    assert.equal(publicOffers.status, 200);
    const siteOffer = publicOffers.data.rooms.find(r => r.code === 'CAT-2');
    assert.equal(siteOffer.quote.billableDays, 3); assert.equal(siteOffer.quote.totalPrice, '2700.75');
    const draft = await request('/v1/public/pet-hotel/drafts', { offerToken: siteOffer.offerToken }, undefined, 'http://127.0.0.1:4274');
    assert.equal(draft.status, 201);
    const imported = await request('/v1/portal/pet-hotel/draft', { token: draft.data.token });
    assert.equal(imported.data.roomId, siteOffer.id);
    assert.equal((await request('/v1/portal/pet-hotel/draft', { token: draft.data.token }, cookies[1])).status, 403);
    const options = await settled(await queue('OPTIONS', s));
    firstOffer = options.rooms.find(r => r.code === 'CAT-2');
    originalBook = await queue('BOOK', bookInput(firstOffer));
    saved = await settled(originalBook);
    assert.equal(saved.status, 'CONFIRMED'); assert.equal(saved.totalPrice, '2700.75');
    const db = await f.prisma.petHotelReservation.findUniqueOrThrow({ where: { id: saved.id } });
    assert.equal(db.ownerId, owner.id); assert.equal(db.source, 'OWNER_PORTAL'); assert.equal(db.status, 'RESERVED'); assert.equal(db.dailyRate.toFixed(2), '900.25');
    const reopened = await settled(await queue('STATE', {}));
    assert.equal(reopened.bookings.find(b => b.id === saved.id).totalPrice, '2700.75');
    assert.ok(!JSON.stringify(reopened).includes(other.id));
  });
  await t.test('same browser key, lost response, expiry and disabled module recover exactly one receipt', async () => {
    const previousRows = await f.prisma.petHotelReservation.count(), previousNotices = await f.prisma.petHotelNotification.count();
    const row = await g.prisma.petHotelPortalOperation.findUniqueOrThrow({ where: { id: originalBook.id } });
    const replay = await queue('BOOK', row.input, cookies[0], row.clientKey);
    assert.equal(replay.id, row.id);
    await f.prisma.clinicModuleInstallation.update({ where: { id: f.installation.id }, data: { enabled: false } });
    const clinicalItem = { ...row, expiresAt: new Date(Date.now() - 1000).toISOString() };
    assert.equal((await f.ownerService.execute(clinicalItem)).id, saved.id);
    await rejects(f.ownerService.execute({ ...clinicalItem, id: randomUUID() }), 409);
    await rejects(f.ownerService.execute(command('BOOK', { ...row.input, notes: 'Новая команда' })), 403);
    assert.equal(await f.prisma.petHotelReservation.count(), previousRows); assert.equal(await f.prisma.petHotelNotification.count(), previousNotices);
    await f.prisma.clinicModuleInstallation.update({ where: { id: f.installation.id }, data: { enabled: true } });
    // The result was committed in the clinic; restore a lost gateway response and retry the same ID.
    await g.prisma.petHotelPortalOperation.update({ where: { id: row.id }, data: { status: 'PENDING', result: null, expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await settled(row)).id, saved.id);
    assert.equal(await f.prisma.petHotelReservation.count(), previousRows); assert.equal(await f.prisma.petHotelNotification.count(), previousNotices);
  });
  await t.test('an offer cannot be moved across owners, pets or edited browser prices', async () => {
    await rejects(f.ownerService.execute(command('BOOK', bookInput(firstOffer, other.animal.id), other.id)), 409);
    await rejects(f.ownerService.execute(command('BOOK', { ...bookInput(firstOffer), totalPrice: '1.00' })), 400);
    await rejects(f.ownerService.execute(command('BOOK', { ...bookInput(firstOffer), offerToken: firstOffer.offerToken + 'x' })), 409);
    assert.equal((await request('/v1/portal/pet-hotel/operations/' + originalBook.id, undefined, cookies[1])).status, 404);
    await rejects(f.ownerService.execute(command('CANCEL', { reservationId: saved.id, version: saved.version }, other.id)), 404);
  });
  await t.test('concurrent clinical reservations have one winner, and an old unprocessed command does not write', async () => {
    const a = selection(30), b = { ...a, animalId: other.animal.id };
    const [offersA, offersB] = await Promise.all([f.ownerService.execute(command('OPTIONS', a)), f.ownerService.execute(command('OPTIONS', b, other.id))]);
    const room = f.rooms.find(r => r.code === 'CAT-4');
    const commands = [command('BOOK', bookInput(offersA.rooms.find(r => r.id === room.id))), command('BOOK', bookInput(offersB.rooms.find(r => r.id === room.id), other.animal.id), other.id)];
    const results = await Promise.allSettled(commands.map(c => f.ownerService.execute(c)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.getStatus(), 409);
    assert.equal(await f.prisma.petHotelReservation.count({ where: { roomId: room.id, startsAt: new Date(a.startsAt) } }), 1);
    const count = await f.prisma.petHotelReservation.count();
    await rejects(f.ownerService.execute({ ...commands[0], id: randomUUID(), expiresAt: new Date(Date.now() - 1000).toISOString() }), 409);
    assert.equal(await f.prisma.petHotelReservation.count(), count);
  });
  await t.test('changed room prices invalidate old offers; moving a saved booking keeps its tariff', async () => {
    const s = selection(50), oldOptions = await f.ownerService.execute(command('OPTIONS', s));
    const room = (await f.hotel.overview(f.staff.director)).rooms.find(r => r.code === 'CAT-2');
    await f.hotel.saveRoom({ ...room, dailyRate: 1000.50 }, f.staff.director, room.id);
    await rejects(f.ownerService.execute(command('BOOK', bookInput(oldOptions.rooms.find(r => r.id === room.id)))), 409);
    const next = selection(8, { reservationId: saved.id }), options = await settled(await queue('OPTIONS', next));
    const target = options.rooms.find(r => r.id === room.id);
    assert.equal(target.quote.dailyRate, '900.25');
    const oldVersion = saved.version;
    saved = await settled(await queue('RESCHEDULE', { ...bookInput(target), reservationId: saved.id, version: oldVersion }));
    assert.equal(saved.dailyRate, '900.25'); assert.equal(saved.totalPrice, '2700.75'); assert.equal(saved.version, oldVersion + 1);
    await rejects(f.ownerService.execute(command('RESCHEDULE', { ...bookInput(target), reservationId: saved.id, version: oldVersion })), 409);
    const fresh = await f.ownerService.execute(command('OPTIONS', s)); assert.equal(fresh.rooms.find(r => r.id === room.id).quote.dailyRate, '1000.50');
  });
  await t.test('shared MAX onboarding needs verification, does not depend on grooming and refuses phone takeover', async () => {
    const registration = g.app.get(require('../apps/owner-gateway/dist/pet-hotel/pet-hotel-registration.service.js').PetHotelRegistrationService);
    const begin = await request('/v1/portal/pet-hotel/registration', {}, ''); assert.equal(begin.status, 201);
    const cookie = begin.headers.get('set-cookie').split(';')[0], payload = new URL(begin.data.url).searchParams.get('start');
    assert.equal((await request('/v1/portal/pet-hotel/registration/details', { fullName: 'Новый клиент QA', phone: '+79990000621', contactConsent: true }, cookie)).status, 409);
    await registration.bindMax(payload, '999999021');
    await f.sync.syncNow();
    assert.equal((await request('/v1/portal/pet-hotel/registration', undefined, cookie)).data.status, 'NEEDS_DETAILS');
    assert.equal((await request('/v1/portal/pet-hotel/registration/details', { fullName: 'Новый клиент QA', phone: '+79990000621', contactConsent: true }, cookie)).status, 201);
    await f.sync.syncNow();
    assert.equal((await request('/v1/portal/pet-hotel/registration', undefined, cookie)).data.status, 'READY');
    const login = await request('/v1/portal/pet-hotel/registration/session', {}, cookie); assert.equal(login.status, 201);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.equal((await request('/v1/portal/pet-hotel/registration/session', {}, cookie)).status, 403);
    const newOwner = await f.prisma.owner.findFirstOrThrow({ where: { maxUserId: '999999021' } });
    assert.equal(newOwner.source, 'PET_HOTEL_MAX'); assert.equal(await f.prisma.owner.count({ where: { maxUserId: '999999021' } }), 1);
    assert.equal((await f.ownerService.register(randomUUID(), '999999022', { fullName: 'Другой QA', phone: '+79990000621' })).status, 'REVIEW_REQUIRED');
    assert.equal((await f.ownerService.register(randomUUID(), '999999021', {})).ownerId, newOwner.id);
    assert.equal(process.env.GROOMING_CRM_SYNC_ENABLED, 'false');
  });
  await t.test('shared pet creation is idempotent and the hotel-only staff cannot enter grooming', async () => {
    const op = command('PET_CREATE', { nickname: 'Тедди · QA', species: 'DOG', breed: 'Пудель', weightKg: 5.25 });
    const pet = await f.ownerService.execute(op); assert.equal((await f.ownerService.execute(op)).id, pet.id);
    assert.equal(await f.prisma.animal.count({ where: { id: pet.id, ownerId: owner.id } }), 1);
    const state = await f.ownerService.execute(command('STATE', {})); assert.ok(state.animals.some(a => a.id === pet.id && a.weightKg === '5.25'));
    const bad = selection(60, { animalId: pet.id, species: 'DOG', weightKg: 11 }); await rejects(f.ownerService.execute(command('OPTIONS', bad)), 400);
    const api = (await f.app.getUrl()) + '/api';
    const login = async person => { const r = await fetch(api + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: person.email, password: integratedPassword }) }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; };
    const operator = await login(f.staff.pet_hotel_operator), groomer = await login(f.staff.groomer);
    assert.equal((await fetch(api + '/v1/pet-hotel/overview', { headers: { cookie: operator } })).status, 200);
    assert.equal((await fetch(api + '/v1/pet-hotel/overview', { headers: { cookie: groomer } })).status, 403);
    const me = await (await fetch(api + '/auth/me', { headers: { cookie: operator } })).json();
    assert.ok(me.employee.permissions.every(p => p.startsWith('pet_hotel.')));
    assert.equal((await fetch(api + '/v1/pet-hotel/rooms/setup', { method: 'POST', headers: { cookie: operator, 'content-type': 'application/json' }, body: JSON.stringify({ clientKey: randomUUID() }) })).status, 403);
  });
  await t.test('cancellation persists, prevents stale reminders and leaves clinical and grooming data unchanged', async () => {
    const cancel = command('CANCEL', { reservationId: saved.id, version: saved.version });
    const result = await f.ownerService.execute(cancel); assert.equal(result.status, 'CANCELLED');
    assert.equal((await f.ownerService.execute(cancel)).version, result.version);
    assert.equal((await f.prisma.petHotelReservation.findUniqueOrThrow({ where: { id: saved.id } })).status, 'CANCELLED');
    assert.equal(await f.prisma.petHotelNotification.count({ where: { reservationId: saved.id, event: 'REMINDER', status: 'QUEUED' } }), 0);
    assert.equal(await f.prisma.petHotelNotification.count({ where: { reservationId: saved.id, reservationVersion: result.version, event: 'CANCELLED' } }), 2);
    assert.deepEqual(await Promise.all([f.prisma.appointment.count(), f.prisma.visit.count(), f.prisma.bill.count(), f.prisma.payment.count(), f.prisma.groomingReservation.count()]), clinicalBefore);
    assert.equal(await f.prisma.petHotelNotification.count({ where: { status: 'SENT' } }), 0, 'QA must not claim an actual MAX send');
  });
  await t.test('real HTTP outbox uses fake MAX sender for owner/staff, reminders and ambiguous retries', async () => {
    const { MaxBotClient } = require('../apps/owner-gateway/dist/max-bot.client.js');
    const max = g.app.get(MaxBotClient), originalOwnerSend = max.sendMessage, originalStaffSend = max.sendStaffMessage;
    const intercepted = [];
    max.sendMessage = async (id, text, destination) => { intercepted.push({ kind: 'OWNER', id, text, destination }); return { messageId: 'qa-intercepted-' + randomUUID() }; };
    max.sendStaffMessage = async (id, text) => { intercepted.push({ kind: 'STAFF', id, text }); return { messageId: 'qa-intercepted-' + randomUUID() }; };
    process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED = 'true';
    try {
      await g.prisma.ownerNotificationPreference.upsert({ where: { ownerId: owner.id }, create: { ownerId: owner.id, enabled: true, appointmentChanges: true, appointmentReminders: true, channel: 'MAX', quietStartMinute: 0, quietEndMinute: 0 }, update: { enabled: true, appointmentChanges: true, appointmentReminders: true, quietStartMinute: 0, quietEndMinute: 0 } });
      await g.prisma.messengerBinding.upsert({ where: { ownerId_channel: { ownerId: owner.id, channel: 'MAX' } }, create: { ownerId: owner.id, channel: 'MAX', externalUserId: '999999031' }, update: { externalUserId: '999999031' } });
      await f.prisma.petHotelNotification.updateMany({ where: { status: { in: ['QUEUED', 'FAILED'] } }, data: { status: 'CANCELLED' } });
      const options = await f.ownerService.execute(command('OPTIONS', selection(70)));
      const booking = await f.ownerService.execute(command('BOOK', bookInput(options.rooms[0])));
      await f.sync.dispatch();
      const immediate = await f.prisma.petHotelNotification.findMany({ where: { reservationId: booking.id, event: 'CONFIRMED' } });
      assert.equal(immediate.length, 2); assert.ok(immediate.every(n => n.status === 'SENT')); assert.equal(intercepted.length, 2);
      assert.equal(intercepted.find(x => x.kind === 'OWNER').destination, 'pet-hotel');
      await f.sync.dispatch(); assert.equal(intercepted.length, 2);
      // Recover a lost delivery response with the same notification ID, without another MAX send.
      await f.prisma.petHotelNotification.update({ where: { id: immediate[0].id }, data: { status: 'QUEUED' } });
      await f.sync.dispatch(); assert.equal(intercepted.length, 2);
      const reminderAt = new Date(Date.parse(booking.startsAt) - 24 * 3600000 + 60000);
      await f.sync.dispatch(reminderAt);
      const reminders = await f.prisma.petHotelNotification.findMany({ where: { reservationId: booking.id, event: 'REMINDER' } });
      assert.equal(reminders.length, 2); assert.ok(reminders.every(n => n.status === 'SENT')); assert.equal(intercepted.filter(x => x.text.startsWith('Напоминание.')).length, 2);
      const options2 = await f.ownerService.execute(command('OPTIONS', selection(80)));
      const booking2 = await f.ownerService.execute(command('BOOK', bookInput(options2.rooms[0])));
      max.sendMessage = async () => { intercepted.push({ kind: 'AMBIGUOUS_OWNER' }); throw new Error('Synthetic lost provider response'); };
      await f.sync.dispatch();
      const ambiguous = await f.prisma.petHotelNotification.findFirstOrThrow({ where: { reservationId: booking2.id, event: 'CONFIRMED', recipientKind: 'OWNER' } });
      assert.equal(ambiguous.status, 'UNKNOWN');
      const attempts = intercepted.length;
      await f.sync.dispatch(); assert.equal(intercepted.length, attempts);
      await f.prisma.petHotelNotification.update({ where: { id: ambiguous.id }, data: { status: 'SENDING', attemptedAt: new Date(Date.now() - 120000) } });
      await f.sync.dispatch(); assert.equal(intercepted.length, attempts);
      assert.equal((await f.prisma.petHotelNotification.findUniqueOrThrow({ where: { id: ambiguous.id } })).status, 'UNKNOWN');
    } finally { max.sendMessage = originalOwnerSend; max.sendStaffMessage = originalStaffSend; process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED = 'false'; }
  });
});
