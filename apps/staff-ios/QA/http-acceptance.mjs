import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const local = 'http://127.0.0.1:4268';
const remote = 'http://127.0.0.1:4269';
const info = await fetch(local + '/__qa/info').then(r => r.json());
assert.equal(info.synthetic, true);
const checks = [];
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name); }
const qa = path => fetch(local + '/__qa/' + path).then(async r => { assert.equal(r.status, 200); return r.json(); });
function client(base = local) {
  const jar = new Map();
  return { jar, async call(path, body, method = body ? 'POST' : 'GET') {
    const r = await fetch(base + '/api/' + path, { method, redirect: 'error', headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k,v]) => k + '=' + v).join('; ') }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const cookie of r.headers.getSetCookie()) { const first = cookie.split(';')[0]; const i = first.indexOf('='); jar.set(first.slice(0, i), first.slice(i + 1)); }
    return { status: r.status, data: await r.json(), cache: r.headers.get('cache-control') };
  }};
}
async function login(c, role) { const user = info.users[role]; const r = await c.call('auth/login', { login: user.login, password: user.password }); assert.equal(r.status, 200); return r.data; }
const staff = 'v1/staff-app/';
const range = 'from=' + encodeURIComponent(info.date + 'T00:00:00+03:00') + '&to=' + encodeURIComponent(info.date + 'T23:59:59+03:00');
const doctor = client(), groomer = client();
await qa('clinic-booking?enabled=false');
await check('ordinary CRM login preserves doctor cashier stock without administrator', async () => {
  const result = await login(doctor, 'doctor');
  for (const role of ['doctor', 'cashier', 'stock']) assert.ok(result.employee.roles.includes(role));
  assert.ok(!result.employee.roles.includes('administrator'));
  for (const p of ['business.read', 'payroll.read', 'daily_finance.read']) assert.ok(!result.employee.permissions.includes(p));
});
await check('doctor sees colleague by default; mine is explicit; no-store', async () => {
  const all = await doctor.call(staff + 'agenda?' + range), mine = await doctor.call(staff + 'agenda?' + range + '&scope=mine');
  assert.equal(all.status, 200); assert.equal(all.cache, 'no-store'); assert.ok(all.data.items.length > mine.data.items.length);
  assert.ok(all.data.items.some(x => x.animal.nickname === info.otherAnimal));
  assert.ok(!mine.data.items.some(x => x.animal.nickname === info.otherAnimal));
});
await check('ungranted mobile booking rejected; employee settings remain privileged', async () => {
  assert.equal((await doctor.call(staff + 'me')).data.canBook, false);
  assert.equal((await doctor.call(staff + 'settings')).status, 403);
  assert.equal((await doctor.call(staff + 'clinic/appointments', { clientKey: randomUUID(), ownerId: info.owner.id, animalId: info.owner.animalId, startsAt: info.date + 'T16:45:00+03:00' })).status, 403);
});
await check('clinic grant is individual; booking lands in ordinary CRM exactly once', async () => {
  await qa('clinic-booking?enabled=true'); const before = await qa('state');
  const body = { clientKey: randomUUID(), ownerId: info.owner.id, animalId: info.owner.animalId, employeeId: info.users.doctor.id, startsAt: info.date + 'T16:45:00+03:00', comment: 'Синтетическая HTTP-приёмка iOS' };
  const first = await doctor.call(staff + 'clinic/appointments', body), repeat = await doctor.call(staff + 'clinic/appointments', body);
  assert.equal(first.status, 201); assert.equal(repeat.data.id, first.data.id); assert.equal((await qa('state')).appointments, before.appointments + 1);
  await qa('clinic-booking?enabled=false');
});
await check('groomer cannot request clinic agenda or clinic resources', async () => {
  await login(groomer, 'groomer');
  assert.equal((await groomer.call(staff + 'agenda?' + range + '&scope=clinic')).status, 403);
  assert.equal((await groomer.call(staff + 'clinic/resources')).status, 403);
});
let contact, pet;
await check('full-phone lookup and client/pet creation use guarded CRM routes', async () => {
  assert.equal((await groomer.call(staff + 'clients/lookup', { phone: '999' })).status, 400);
  const found = await groomer.call(staff + 'clients/lookup', { phone: info.owner.phone }); assert.equal(found.data[0].id, info.owner.id);
  const created = await groomer.call(staff + 'clients', { phone: '+79998887766', fullName: 'Синтетический клиент iOS' }); assert.equal(created.status, 201); contact = created.data;
  const catalog = await groomer.call(staff + 'pet-catalog'); const species = catalog.data.find(x => x.title === 'Собака'); assert.ok(species);
  const createdPet = await groomer.call(staff + 'clients/' + contact.id + '/pets', { nickname: 'Ирис · iOS QA', species: species.title, breed: species.breeds[0].title, clientAccessToken: contact.clientAccessToken });
  assert.equal(createdPet.status, 201); pet = createdPet.data;
});
let booking;
const overview = (await groomer.call(staff + 'grooming/overview')).data;
const rule = overview.rules.find(r => r.isActive && r.species === 'DOG');
const options = () => ({ ownerId: contact.id, animalId: pet.id, clientAccessToken: contact.clientAccessToken, serviceId: rule.serviceId, species: 'DOG', size: 'SMALL', coat: 'ANY', date: info.date });
await check('groomer creates own booking and persisted card', async () => {
  const offers = await groomer.call(staff + 'grooming/options', options()); assert.equal(offers.status, 201); assert.ok(offers.data.offers.length);
  const offer = offers.data.offers.find(x => x.startsAt.includes('09:45')) || offers.data.offers[0];
  const result = await groomer.call(staff + 'grooming/bookings', { ownerId: contact.id, clientKey: randomUUID(), offerToken: offer.offerToken, notes: 'HTTP iOS synthetic', looks: [], contactConsent: true, bookingConsent: true });
  assert.equal(result.status, 201); booking = (await groomer.call(staff + 'grooming/bookings/' + result.data.id)).data; assert.equal(booking.animalId, pet.id);
});
await check('own duration update preserves price and identity and rejects colleague access', async () => {
  const before = booking;
  const updated = await groomer.call(`v1/grooming/bookings/${booking.id}/duration`, { clientKey: randomUUID(), version: booking.version, durationMinutes: 120 }, 'PATCH');
  assert.equal(updated.status, 200, updated.data.message);
  booking = (await groomer.call(staff + 'grooming/bookings/' + booking.id)).data;
  for (const key of ['id', 'ownerId', 'animalId', 'startsAt', 'serviceTitle', 'price', 'employeeId', 'workplaceId']) assert.deepEqual(booking[key], before[key]);
  assert.equal(Date.parse(booking.endsAt) - Date.parse(booking.startsAt), 120 * 60000);
  const other = client(); await login(other, 'otherGroomer');
  assert.equal((await other.call(`v1/grooming/bookings/${booking.id}/duration`, { clientKey: randomUUID(), version: booking.version, durationMinutes: 90 }, 'PATCH')).status, 404);
  assert.equal((await groomer.call(`v1/grooming/bookings/${booking.id}/duration`, { clientKey: randomUUID(), version: before.version, durationMinutes: 90 }, 'PATCH')).status, 409);
});
await check('reschedule verifies version and preserves reservation identity', async () => {
  const result = await groomer.call(staff + 'grooming/options', { ...options(), reservationId: booking.id }); const offer = result.data.offers.at(-1);
  const body = { ownerId: contact.id, clientKey: randomUUID(), offerToken: offer.offerToken, notes: 'HTTP move iOS', looks: [], contactConsent: true, bookingConsent: true };
  assert.equal((await groomer.call(staff + `grooming/bookings/${booking.id}/reschedule?version=${booking.version}`, body)).status, 201);
  const fresh = (await groomer.call(staff + 'grooming/bookings/' + booking.id)).data; assert.equal(fresh.id, booking.id); assert.ok(fresh.version > booking.version); booking = fresh;
});
await check('arrival start completion and stale-version rejection', async () => {
  await qa('visit-started?id=' + booking.id);
  for (const status of ['ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
    const result = await groomer.call(staff + 'grooming/bookings/' + booking.id + '/status', { clientKey: randomUUID(), version: booking.version, status }); assert.equal(result.status, 201);
    booking = (await groomer.call(staff + 'grooming/bookings/' + booking.id)).data; assert.equal(booking.status, status);
  }
  assert.equal((await groomer.call(staff + 'grooming/bookings/' + booking.id + '/status', { clientKey: randomUUID(), version: 1, status: 'CANCELLED' })).status, 409);
});
await check('own cancellation and no-show persist through ordinary status API', async () => {
  for (const status of ['CANCELLED', 'NO_SHOW']) {
    const offered = await groomer.call(staff + 'grooming/options', options());
    const offer = offered.data.offers[0]; assert.ok(offer);
    const created = await groomer.call(staff + 'grooming/bookings', { ownerId: contact.id, clientKey: randomUUID(), offerToken: offer.offerToken, notes: 'Synthetic status ' + status, looks: [], contactConsent: true, bookingConsent: true });
    assert.equal(created.status, 201); let card = (await groomer.call(staff + 'grooming/bookings/' + created.data.id)).data;
    if (status === 'NO_SHOW') await qa('visit-started?id=' + card.id);
    assert.equal((await groomer.call(staff + 'grooming/bookings/' + card.id + '/status', { clientKey: randomUUID(), version: card.version, status })).status, 201);
    assert.equal((await groomer.call(staff + 'grooming/bookings/' + card.id)).data.status, status);
  }
});
await check('inbox mark read persists across requests', async () => {
  const inbox = (await doctor.call(staff + 'inbox')).data;
  assert.ok(inbox.items.length); const notice = inbox.items[0]; await doctor.call(staff + 'inbox/' + notice.id + '/read', {});
  assert.ok((await doctor.call(staff + 'inbox')).data.items.find(x => x.id === notice.id).readAt);
});
await check('personal messages include groomers and remain one shared idempotent history', async () => {
  const recipients = await doctor.call('v1/internal-messages/recipients');
  assert.ok(recipients.data.some(x => x.id === info.users.groomer.id));
  for (const item of recipients.data) for (const field of ['phone','email','permissions']) assert.ok(!(field in item));
  const body = { recipientId: info.users.groomer.id, body: 'Личная проверка iOS ' + randomUUID(), clientKey: randomUUID() };
  const first = await doctor.call('v1/internal-messages', body), again = await doctor.call('v1/internal-messages', body);
  assert.equal(first.status, 201); assert.equal(first.data.id, again.data.id);
  assert.equal((await doctor.call('v1/internal-messages', { ...body, body: 'другой текст' })).status, 409);
  const thread = (await groomer.call('v1/internal-messages?employeeId=' + info.users.doctor.id)).data;
  assert.equal(thread.items.filter(x => x.id === first.data.id).length, 1);
  const colleague = client(); await login(colleague, 'colleague');
  assert.ok(!(await colleague.call('v1/internal-messages?employeeId=' + info.users.doctor.id)).data.items.some(x => x.id === first.data.id));
  assert.equal((await colleague.call('v1/internal-messages/conversations/' + info.users.doctor.id + '/read', { throughId: first.data.id })).status, 404);
  const before = (await groomer.call('v1/internal-messages/conversations')).data.totalUnread;
  const newer = await doctor.call('v1/internal-messages', { recipientId: info.users.groomer.id, body: 'Новое после границы чтения', clientKey: randomUUID() });
  assert.equal((await groomer.call('v1/internal-messages/conversations/' + info.users.doctor.id + '/read', { throughId: first.data.id })).status, 201);
  const fresh = (await groomer.call('v1/internal-messages?employeeId=' + info.users.doctor.id)).data;
  assert.ok(fresh.items.find(x => x.id === first.data.id).readAt); assert.equal(fresh.items.find(x => x.id === newer.data.id).readAt, null);
});
await check('one clinic channel reaches all peers with independent read boundaries', async () => {
  const director = client(); await login(director, 'director');
  await doctor.call('v1/internal-messages/clinic'); await groomer.call('v1/internal-messages/clinic'); await director.call('v1/internal-messages/clinic');
  const before = await qa('state'), body = { body: 'Общий канал iOS ' + randomUUID(), clientKey: randomUUID() };
  const first = await doctor.call('v1/internal-messages/clinic/messages', body), repeat = await doctor.call('v1/internal-messages/clinic/messages', body);
  assert.equal(first.status, 201); assert.equal(first.data.id, repeat.data.id);
  assert.equal((await qa('state')).clinicMessages, before.clinicMessages + 1);
  const a = (await groomer.call('v1/internal-messages/clinic/messages')).data, b = (await director.call('v1/internal-messages/clinic/messages')).data;
  assert.equal(a.items.find(x => x.id === first.data.id).body, body.body); assert.ok(b.items.some(x => x.id === first.data.id));
  const directorUnread = (await director.call('v1/internal-messages/clinic')).data.unreadCount;
  assert.equal((await groomer.call('v1/internal-messages/clinic/read', { throughId: first.data.id })).status, 201);
  assert.equal((await groomer.call('v1/internal-messages/clinic')).data.unreadCount, 0);
  assert.equal((await director.call('v1/internal-messages/clinic')).data.unreadCount, directorUnread);
  const events = (await qa('state')).nativeEvents.filter(x => x.sourceId === first.data.id);
  assert.ok(events.some(x => x.employeeId === info.users.groomer.id && x.kind === 'CLINIC_CHAT'));
  assert.ok(events.some(x => x.employeeId === info.users.director.id)); assert.ok(!events.some(x => x.employeeId === info.users.doctor.id));
  assert.ok(!(await groomer.call('v1/internal-messages?employeeId=' + info.users.doctor.id)).data.items.some(x => x.body === body.body));
  const ownEvent = events.find(x => x.employeeId === info.users.groomer.id);
  assert.equal((await groomer.call(staff + 'native-push/events/' + ownEvent.id)).data.kind, 'CLINIC_CHAT');
  assert.equal((await doctor.call(staff + 'native-push/events/' + ownEvent.id)).status, 404);
});
await check('unconfigured APNs is unavailable and cannot masquerade as registered delivery', async () => {
  const config = await groomer.call(staff + 'native-push/config?platform=IOS&applicationId=ru.temichevvet.staff');
  assert.equal(config.data.provider, 'APNS'); assert.equal(config.data.available, false);
  assert.equal((await groomer.call(staff + 'native-push/devices', { installationId: randomUUID(), platform: 'IOS', applicationId: 'ru.temichevvet.staff', token: 'a'.repeat(64), environment: 'SANDBOX' })).status, 503);
});
await check('remote login requires trusted device; invitation single-use; revocation enforced', async () => {
  const c = client(remote), user = info.users.groomer;
  assert.equal((await c.call('auth/login', { login: user.login, password: user.password })).status, 401);
  const invitation = await qa('invitation?role=groomer');
  assert.equal((await c.call('v1/remote-access/enroll', { code: invitation.code, deviceName: 'iOS HTTP QA' })).status, 200);
  assert.equal((await c.call('v1/remote-access/enroll', { code: invitation.code, deviceName: 'iOS HTTP QA' })).status, 400);
  const result = await login(c, 'groomer'); assert.equal(result.accessType, 'REMOTE');
  await qa('revoke?role=groomer'); assert.equal((await c.call('auth/me')).status, 401);
});
await writeFile(new URL('../Docs/http-acceptance.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), schema: 'staff_ios_qa_20261028', externalDelivery: false, passed: checks.length, checks }, null, 2));
console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
