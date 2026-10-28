import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { staffMobileFixture } from './helpers/staff-mobile-fixture.mjs';
const require = createRequire(import.meta.url);
const { assertStaffBooking, staffAppSettings } = require('../apps/api/dist/modules/staff-app/staff-app.policy.js');
const bookingInput = (offer, ownerId) => ({ ownerId, clientKey: randomUUID(), offerToken: offer.offerToken, notes: '', looks: [], contactConsent: true, bookingConsent: true });

test('mobile features default to read-only; independent grants and denials preserve operational roles', async () => {
  assert.deepEqual(staffAppSettings(), { enabled: true, clinicBooking: false, groomingBooking: false, notifications: true });
  for (const roles of [['doctor'], ['assistant'], ['cashier'], ['stock'], ['administrator'], ['director']]) {
    assert.throws(() => assertStaffBooking({ id: 'e', roles, permissions: ['appointments.read', 'appointments.manage'] }, 'clinic'), /не включена/);
  }
  const f = await staffMobileFixture();
  try {
    const before = await f.actor(f.clinical.id);
    const enabled = await f.configure(before.id, { clinicBooking: true });
    assert.equal(f.mobile.profile(enabled).canBook, true);
    assert.deepEqual(enabled.roles, before.roles);
    assert.ok(enabled.roles.includes('stock') && enabled.roles.includes('cashier'));
    assert.equal(enabled.restrictLoginToShifts, before.restrictLoginToShifts);
    assert.equal(enabled.allowRemoteOutsideShift, before.allowRemoteOutsideShift);
    assert.ok(!enabled.permissions.includes('business.read') && !enabled.permissions.includes('payroll.read'));
    const old = await f.prisma.employee.findUnique({ where: { id: before.id } });
    await f.configure(before.id, { enabled: false });
    await assert.rejects(f.mobile.saveSettings(before.id, { ...enabled.staffApp, updatedAt: old.updatedAt.toISOString() }, await f.actor(f.director.id)), /изменились/);
    await assert.rejects(f.mobile.agenda(await f.actor(before.id), new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()), /отключено/);
    await assert.rejects(f.mobile.settings(before), /недоступны/);
    const admin = await f.actor(f.administrator.id), list = await f.mobile.settings(admin);
    assert.ok(list.every(item => item.canGroomingBook));
    assert.ok(!list.some(item => item.id === before.id));
    await assert.rejects(f.mobile.saveSettings(before.id, { ...enabled.staffApp, updatedAt: old.updatedAt.toISOString() }, admin), /только.*грумеров/);
  } finally { await f.close(); }
});

test('groomer books only their own real slots; signed client and offer proofs cannot be transferred', async () => {
  const f = await staffMobileFixture();
  try {
    let groomer = await f.actor(f.groomer.id);
    await assert.rejects(f.service.options(f.owner.id, f.options, new Date(), groomer), /не включена/);
    groomer = await f.configure(groomer.id, { groomingBooking: true });
    const other = await f.configure(f.otherGroomer.id, { groomingBooking: true });
    assert.deepEqual(groomer.permissions, ['grooming.operate', 'grooming.read']);
    const [contact] = await f.mobile.lookupClient(f.phone, groomer);
    const options = { ...f.options, clientAccessToken: contact.clientAccessToken };
    await assert.rejects(f.service.options(f.owner.id, { ...options, clientAccessToken: undefined }, new Date(), groomer), /номер.*телефона/);
    await assert.rejects(f.service.assertStaffClientAccess(other, f.owner.id, contact.clientAccessToken), /номер.*телефона/);
    const found = await f.service.options(f.owner.id, options, new Date(), groomer);
    assert.ok(found.offers.length);
    assert.ok(found.offers.every(offer => offer.specialistId === f.specialist.id));
    assert.equal((await f.service.options(f.owner.id, { ...options, specialistId: f.secondSpecialist.id }, new Date(), groomer)).offers.length, 0);
    const body = bookingInput(found.offers[0], f.owner.id);
    await assert.rejects(f.service.book(f.owner.id, body, new Date(), other), /другому сотруднику/);
    const saved = await f.service.book(f.owner.id, body, new Date(), groomer);
    assert.equal((await f.service.book(f.owner.id, body, new Date(), groomer)).id, saved.id);
    assert.equal(await f.prisma.groomingReservation.count({ where: { id: saved.id } }), 1);
    assert.ok((await f.service.bookings(f.administrator)).some(item => item.id === saved.id));
    assert.equal((await f.service.bookings(other)).some(item => item.id === saved.id), false);
    await assert.rejects(f.service.booking(saved.id, other), /не найдена/);
    await assert.rejects(f.service.status(saved.id, '', { clientKey: randomUUID(), version: saved.version, status: 'ARRIVED' }, new Date(), other), /не найдена/);
    const movedOffer = (await f.service.options(f.owner.id, { ...options, reservationId: saved.id }, new Date(), groomer)).offers.at(-1);
    const moved = await f.service.book(f.owner.id, bookingInput(movedOffer, f.owner.id), new Date(), groomer, { id: saved.id, version: saved.version });
    assert.equal(moved.id, saved.id);
    assert.notEqual(moved.startsAt, saved.startsAt);
    assert.equal((await f.service.booking(saved.id, f.administrator)).startsAt.toISOString(), moved.startsAt);
    assert.ok((await f.mobile.inbox(groomer)).items.some(item => item.reservationId === saved.id));
    const arrived = await f.service.status(saved.id, '', { clientKey: randomUUID(), version: moved.version, status: 'ARRIVED' }, new Date(), groomer);
    assert.equal(arrived.status, 'ARRIVED');
    const disabled = await f.configure(groomer.id, { notifications: false });
    assert.deepEqual(await f.notices.config({ employee: disabled }), { available: false, publicKey: null, devices: [] });
    await assert.rejects(f.notices.subscribe({ employee: disabled }, {}), /отключены/);
  } finally { await f.close(); }
});

test('clinic appointment retries commit once; doctors see all appointments by default and can filter their own', async () => {
  const f = await staffMobileFixture();
  try {
    const startsAt = `${f.selectedDate}T11:00:00+03:00`;
    const input = { clientKey: randomUUID(), ownerId: f.owner.id, animalId: f.animal.id, employeeId: f.clinical.id, startsAt };
    await assert.rejects(f.mobile.createAppointment(input, f.clinical), /не включена/);
    const doctor = await f.configure(f.clinical.id, { clinicBooking: true });
    const [a, b] = await Promise.all([f.mobile.createAppointment(input, doctor), f.mobile.createAppointment(input, doctor)]);
    assert.equal(a.id, b.id);
    assert.equal(await f.prisma.appointment.count({ where: { id: a.id } }), 1);
    await assert.rejects(f.mobile.createAppointment({ ...input, comment: 'different' }, doctor), /другими данными/);
    await assert.rejects(f.mobile.createAppointment({ ...input, clientKey: randomUUID() }, doctor), /занят|available|пересека|запис/i);
    await assert.rejects(f.mobile.createAppointment({ ...input, clientKey: randomUUID(), animalId: f.otherAnimal.id, startsAt: `${f.selectedDate}T15:00:00+03:00` }, doctor), /принадлеж|owner/i);
    const other = await f.doctor('other');
    const otherAppointment = await f.appointments.createAppointment({ ownerId: f.otherOwner.id, animalId: f.otherAnimal.id, employeeId: other.id, startsAt: `${f.selectedDate}T13:00:00+03:00` }, other.id);
    const agenda = await f.mobile.agenda(doctor, `${f.selectedDate}T00:00:00+03:00`, `${f.selectedDate}T23:59:59+03:00`);
    assert.ok(agenda.items.some(item => item.id === a.id));
    assert.ok(agenda.items.some(item => item.id === otherAppointment.id));
    assert.ok((await f.mobile.agenda(other, `${f.selectedDate}T00:00:00+03:00`, `${f.selectedDate}T23:59:59+03:00`)).items.some(item => item.id === a.id));
    const personal = await f.mobile.agenda(other, `${f.selectedDate}T00:00:00+03:00`, `${f.selectedDate}T23:59:59+03:00`, 'mine');
    assert.ok(personal.items.some(item => item.id === otherAppointment.id));
    assert.ok(!personal.items.some(item => item.id === a.id));
    assert.ok(!other.permissions.includes('business.read') && !other.permissions.includes('payroll.read') && !other.permissions.includes('daily_finance.read'));
    assert.ok((await f.mobile.agenda(other, `${f.selectedDate}T00:00:00+03:00`, `${f.selectedDate}T23:59:59+03:00`, 'clinic')).items.some(item => item.id === a.id));
    await assert.rejects(f.mobile.agenda(await f.actor(f.groomer.id), `${f.selectedDate}T00:00:00+03:00`, `${f.selectedDate}T23:59:59+03:00`, 'clinic'), /Нет доступа/);
    await assert.rejects(f.mobile.createAppointment(input, await f.configure(f.groomer.id, { groomingBooking: true })), /не включена/);
  } finally { await f.close(); }
});

test('groomer registers a minimal client and pet without clinical appointments or cross-owner access', async () => {
  const f = await staffMobileFixture();
  try {
    const groomer = await f.configure(f.groomer.id, { groomingBooking: true });
    const other = await f.configure(f.otherGroomer.id, { groomingBooking: true });
    const phone = `7998${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    const contact = await f.mobile.createClient({ fullName: 'Новый клиент · мобильная проверка', phone }, groomer);
    assert.equal((await f.mobile.createClient({ fullName: 'Новый клиент · мобильная проверка', phone }, groomer)).id, contact.id);
    const species = await f.prisma.animalSpecies.upsert({ where: { title: 'Собака' }, create: { code: 'staff-mobile-qa-dog', title: 'Собака' }, update: {} });
    await f.prisma.animalBreed.upsert({ where: { speciesId_title: { speciesId: species.id, title: 'Без породы' } }, create: { speciesId: species.id, title: 'Без породы' }, update: {} });
    const input = { nickname: 'Питомец · тест', species: 'Собака', breed: 'Без породы' };
    await assert.rejects(f.mobile.createPet(contact.id, input, contact.clientAccessToken, other), /номер.*телефона/);
    const pet = await f.mobile.createPet(contact.id, input, contact.clientAccessToken, groomer);
    assert.equal(pet.ownerId, contact.id);
    assert.equal(await f.prisma.visit.count({ where: { ownerId: contact.id } }), 0);
    assert.equal(await f.prisma.appointment.count({ where: { ownerId: contact.id } }), 0);
    const lookup = await f.mobile.lookupClient(phone, groomer);
    assert.ok(lookup[0].animals.some(animal => animal.id === pet.id));
  } finally { await f.close(); }
});

test('PWA scope never caches medical API or mutating commands; icon dimensions are real', async () => {
  const listeners = new Map(), responses = [];
  const script = await readFile('apps/web/public/staff/sw.js', 'utf8');
  const offline = { publicOffline: true };
  runInNewContext(script, { self: { location: { origin: 'https://staff.example.test' }, addEventListener: (name, callback) => listeners.set(name, callback) }, URL,
    caches: { match: async key => { assert.equal(key, '/staff/offline.html'); return offline; } }, fetch: async () => { throw new Error('offline'); }, Response });
  for (const [path, method, mode] of [['/api/v1/staff-app/agenda', 'GET', 'cors'], ['/api/v1/staff-app/grooming/bookings', 'POST', 'cors'], ['/grooming/calendar', 'GET', 'navigate'], ['/staff/today', 'POST', 'navigate']]) {
    listeners.get('fetch')({ request: { url: `https://staff.example.test${path}`, method, mode }, respondWith: response => responses.push(response) });
  }
  assert.equal(responses.length, 0);
  listeners.get('fetch')({ request: { url: 'https://staff.example.test/staff/today', method: 'GET', mode: 'navigate' }, respondWith: response => responses.push(response) });
  assert.equal(await responses[0], offline);
  const manifest = JSON.parse(await readFile('apps/web/public/staff/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.scope, '/staff/');
  for (const size of [192, 512]) {
    const icon = await readFile(`apps/web/public/staff/icon-${size}.png`);
    assert.equal(icon.readUInt32BE(16), size); assert.equal(icon.readUInt32BE(20), size);
  }
});
