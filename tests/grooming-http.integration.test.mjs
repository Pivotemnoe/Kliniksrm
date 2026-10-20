import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
// This suite can connect only to the isolated synthetic grooming databases.
const keep = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, keep, {
  NODE_ENV: 'test', CLINIC_RUNTIME_MODE: 'test', TEMICHEVVET_LICENSE_MODE: 'compatibility',
  DATABASE_URL: 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/avito_merge_grooming_crm_20261020',
  OWNER_GATEWAY_DATABASE_URL: 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/avito_merge_grooming_portal_20261020',
  OWNER_GATEWAY_SYNC_SECRET: 'grooming-local-isolated-qa-secret-20261019', SESSION_COOKIE_SECURE: 'false',
  OWNER_GATEWAY_SESSION_COOKIE: 'grooming_http_owner', SESSION_COOKIE_NAME: 'grooming_http_staff',
  APP_URL: 'http://127.0.0.1:4245', GROOMING_SITE_ORIGINS: 'http://127.0.0.1:4244',
  GROOMING_CRM_SYNC_ENABLED: 'true', GROOMING_CLIENT_NOTIFICATIONS_ENABLED: 'true', GROOMING_QA_MODE: 'true',
  CLINIC_ASSISTANT_ENABLED: 'false', CLINIC_ASSISTANT_REMINDERS_ENABLED: 'false', CLINIC_SITE_CATALOG_SYNC_ENABLED: 'false',
  MAX_BOT_USERNAME: 'grooming-http-qa-bot', MAX_WEBHOOK_SECRET: 'synthetic-webhook-only',
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'External transport is forbidden in grooming HTTP QA');
  return originalFetch(input, options);
};
const require = createRequire(import.meta.url);
const { groomingFixture, qaPassword } = await import('./helpers/grooming-crm-fixture.mjs');
const { NestFactory } = require('@nestjs/core'), { ValidationPipe } = require('@nestjs/common');
const { GroomingStandaloneAppModule } = require('../apps/api/dist/modules/grooming/grooming-standalone.module.js');
const { AppModule: GatewayAppModule } = require('../apps/owner-gateway/dist/app.module.js');
const { GroomingModule } = require('../apps/owner-gateway/dist/grooming/grooming.module.js');
const { MaxBotClient } = require('../apps/owner-gateway/dist/max-bot.client.js');
const { apiBodyParsers, apiAbuseProtection } = require('../apps/api/dist/common/abuse-protection.js');
const { gatewayAbuseProtection } = require('../apps/owner-gateway/dist/abuse-protection.js');
const { setGatewaySecurityHeaders } = require('../apps/owner-gateway/dist/security-headers.js');
const { hashToken } = require('../apps/owner-gateway/dist/security.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('standalone grooming HTTP flow uses real guards, queue, database and fake MAX', { timeout: 90000 }, async t => {
  const f = await groomingFixture();
  let api, gateway;
  t.after(async () => { await api?.close(); await gateway?.close(); await f.close(); });
  gateway = await NestFactory.create(GatewayAppModule, { bodyParser: false, logger: false });
  gateway.use(gatewayAbuseProtection());
  gateway.use((_request, response, next) => { setGatewaySecurityHeaders(response); next(); });
  gateway.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  for (const transport of [gateway.select(GatewayAppModule).get(MaxBotClient, { strict: true }), gateway.select(GroomingModule).get(MaxBotClient, { strict: true })]) {
    transport.sendMessage = (...args) => f.max.sendMessage(...args);
    transport.sendStaffMessage = (...args) => f.max.sendStaffMessage(...args);
    transport.sendPortalButton = (...args) => f.max.sendPortalButton(...args);
  }
  await gateway.listen(0, '127.0.0.1');
  const portalUrl = await gateway.getUrl();
  process.env.OWNER_GATEWAY_URL = portalUrl; process.env.OWNER_GATEWAY_PUBLIC_URL = portalUrl;
  api = await NestFactory.create(GroomingStandaloneAppModule, { bodyParser: false, logger: false });
  api.use(apiAbuseProtection()); api.use(apiBodyParsers('1mb')); api.setGlobalPrefix('api');
  api.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await api.listen(0, '127.0.0.1');
  const apiUrl = `${await api.getUrl()}/api`;
  const request = async (base, path, body, cookie, origin, extra = {}) => {
    const response = await fetch(base + path, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...extra } });
    const raw = await response.text(); let data; try { data = JSON.parse(raw); } catch { data = raw; }
    return { status: response.status, data, headers: response.headers };
  };
  const login = async employee => { const r = await request(apiUrl, '/auth/login', { login: employee.email, password: qaPassword }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login(f.administrator), groomer = await login(f.groomer), otherGroomer = await login(f.otherGroomer);
  const ownerCookie = `grooming_http_owner=${f.sessionToken}`;
  const otherToken = randomUUID() + randomUUID();
  await f.gateway.portalSession.create({ data: { ownerId: f.otherOwner.id, tokenHash: hashToken(otherToken), expiresAt: new Date(Date.now() + 600000) } });
  const otherCookie = `grooming_http_owner=${otherToken}`;
  const operation = async (cookie, kind, input = {}, clientKey = randomUUID()) => {
    const result = await request(portalUrl, '/v1/portal/grooming/operations', { clientKey, kind, input }, cookie, portalUrl);
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return { ...result.data, clientKey };
  };
  const result = async (cookie, pending) => {
    let saved;
    for (let attempt = 0; attempt < 60; attempt++) {
      saved = await request(portalUrl, `/v1/portal/grooming/operations/${pending.id}`, undefined, cookie);
      assert.equal(saved.status, 200);
      if (saved.data.status !== 'PENDING') return saved.data;
      await pause(250);
    }
    throw new Error(`Operation ${pending.id} did not finish: ${JSON.stringify(saved.data)}`);
  };
  const booking = await f.service.book(f.owner.id, { clientKey: randomUUID(), offerToken: (await f.service.options(f.owner.id, f.options)).offers[0].offerToken, notes: '', looks: [], contactConsent: true, bookingConsent: true });

  await t.test('portal HTML and static assets are served even from a hidden worktree root', async () => {
    for (const path of ['/portal/activate', '/portal/grooming', '/portal/grooming.js', '/portal/grooming.css', '/manifest.webmanifest']) {
      const r = await request(portalUrl, path); assert.equal(r.status, 200, path);
      assert.ok(r.headers.get('content-type'));
    }
    assert.match((await request(portalUrl, '/portal/grooming')).data, /grooming\.js/);
  });
  await t.test('anonymous, administrator and groomer guards enforce separate record scopes', async () => {
    assert.equal((await request(apiUrl, '/v1/grooming/overview')).status, 401);
    assert.equal((await request(apiUrl, `/v1/grooming/bookings/${booking.id}`, undefined, groomer)).status, 200);
    assert.equal((await request(apiUrl, `/v1/grooming/bookings/${booking.id}`, undefined, otherGroomer)).status, 404);
    const own = await request(apiUrl, '/v1/grooming/overview', undefined, groomer);
    assert.equal(own.status, 200); assert.equal(own.data.specialists.length, 1); assert.equal(own.data.canManage, false);
    assert.equal((await request(apiUrl, '/v1/grooming/services', { title: 'Запрещено', price: 1 }, admin)).status, 403);
    assert.equal((await request(apiUrl, '/v1/grooming/shifts', { employeeId: f.groomer.id, locationId: f.location.id, kind: 'BLOCK', startsAt: `${f.selectedDate}T19:00:00+03:00`, endsAt: `${f.selectedDate}T19:30:00+03:00`, isActive: true, comment: 'Проверка HTTP' }, admin)).status, 201);
    assert.equal((await request(apiUrl, '/appointments', undefined, admin)).status, 404);
  });
  await t.test('portal rejects cross-origin writes, invalid sessions and owner spoofing', async () => {
    assert.equal((await request(portalUrl, '/v1/portal/grooming/operations', { clientKey: randomUUID(), kind: 'STATE', input: {} })).status, 403);
    assert.equal((await request(portalUrl, '/v1/portal/grooming/operations', { clientKey: randomUUID(), kind: 'STATE', input: {} }, ownerCookie, 'https://untrusted.example')).status, 403);
    const pending = await operation(ownerCookie, 'OPTIONS', { ...f.options, ownerId: f.otherOwner.id });
    assert.equal((await result(ownerCookie, pending)).status, 'FAILED');
    assert.equal((await request(portalUrl, `/v1/portal/grooming/operations/${pending.id}`, undefined, otherCookie)).status, 404);
    assert.equal((await request(portalUrl, `/v1/portal/grooming/operations/by-key/${pending.clientKey}`, undefined, ownerCookie)).data.id, pending.id);
    assert.equal((await request(portalUrl, '/internal/v1/grooming/portal/operations')).status, 403);
  });
  await t.test('staff inbox and device registration use the authenticated groomer and reject spoofing', async () => {
    assert.equal((await request(apiUrl, '/v1/grooming/staff/inbox')).status, 401);
    const inbox = await request(apiUrl, '/v1/grooming/staff/inbox', undefined, groomer);
    assert.equal(inbox.status, 200); assert.equal(inbox.data.unread, 1);
    assert.equal((await request(apiUrl, '/v1/grooming/staff/inbox', undefined, otherGroomer)).data.unread, 0);
    assert.equal((await request(apiUrl, `/v1/grooming/staff/inbox/${inbox.data.items[0].id}/read`, {}, otherGroomer)).status, 404);
    assert.equal((await request(apiUrl, '/v1/grooming/staff/push/config', undefined, groomer)).data.available, false);
    const keys = require('web-push').generateVAPIDKeys();
    Object.assign(process.env, { GROOMING_STAFF_PUSH_ENABLED: 'true', GROOMING_STAFF_VAPID_SUBJECT: 'mailto:qa@example.invalid', GROOMING_STAFF_VAPID_PUBLIC_KEY: keys.publicKey, GROOMING_STAFF_VAPID_PRIVATE_KEY: keys.privateKey });
    try {
      const subscription = { endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: keys.publicKey, auth: Buffer.alloc(16, 7).toString('base64url') };
      assert.equal((await request(apiUrl, '/v1/grooming/staff/push/subscribe', { ...subscription, employeeId: f.otherGroomer.id }, groomer)).status, 400);
      assert.equal((await request(apiUrl, '/v1/grooming/staff/push/subscribe', { ...subscription, endpoint: 'https://127.0.0.1/private' }, groomer)).status, 400);
      assert.equal((await request(apiUrl, '/v1/grooming/staff/push/subscribe', subscription, groomer)).status, 201);
      assert.equal((await request(apiUrl, '/v1/grooming/staff/push/config', undefined, groomer)).data.devices.length, 1);
      assert.equal((await request(apiUrl, '/v1/grooming/staff/push/config', undefined, otherGroomer)).data.devices.length, 0);
      assert.equal((await request(apiUrl, '/v1/grooming/staff/push/subscribe', subscription, otherGroomer)).status, 409);
      assert.equal((await request(apiUrl, '/v1/grooming/staff/push/unsubscribe', { endpoint: subscription.endpoint }, groomer)).status, 201);
      assert.equal((await request(apiUrl, '/v1/grooming/staff/inbox/read-all', {}, groomer)).status, 201);
      assert.equal((await request(apiUrl, '/v1/grooming/staff/inbox', undefined, groomer)).data.unread, 0);
    } finally { for (const key of ['GROOMING_STAFF_PUSH_ENABLED', 'GROOMING_STAFF_VAPID_SUBJECT', 'GROOMING_STAFF_VAPID_PUBLIC_KEY', 'GROOMING_STAFF_VAPID_PRIVATE_KEY']) delete process.env[key]; }
  });
  await t.test('catalogue selection crosses into the cabinet through an opaque owner-claimed draft', async () => {
    const body = { breedId: 'maltipoo', looks: ['maltipoo:shape'], notes: 'Сохранить объём на ушах' };
    assert.equal((await request(portalUrl, '/v1/public/grooming/drafts', body, undefined, 'https://untrusted.example')).status, 403);
    const created = await request(portalUrl, '/v1/public/grooming/drafts', body, undefined, 'http://127.0.0.1:4244');
    assert.equal(created.status, 201);
    const claimed = await request(portalUrl, '/v1/portal/grooming/draft', { token: created.data.token }, ownerCookie, portalUrl);
    assert.equal(claimed.status, 201); assert.deepEqual(claimed.data.looks, body.looks); assert.equal(claimed.data.notes, body.notes);
    assert.equal((await request(portalUrl, '/v1/portal/grooming/draft', { token: created.data.token }, otherCookie, portalUrl)).status, 403);
  });
  await t.test('MAX login rejects forgery and exchanges a verified current-bot challenge for one owner session', async () => {
    const registration = await request(portalUrl, '/v1/portal/grooming/registration', {}, undefined, portalUrl);
    assert.equal(registration.status, 201); assert.match(registration.headers.get('set-cookie'), /HttpOnly/i);
    const payload = new URL(registration.data.url).searchParams.get('start');
    const forged = await request(portalUrl, '/v1/webhooks/max', { update_type: 'bot_started', payload, user: { user_id: 990099009 } });
    assert.equal(forged.status, 403);
    const registrationCookie = registration.headers.get('set-cookie').split(';')[0];
    assert.equal((await request(portalUrl, '/v1/portal/grooming/registration', undefined, registrationCookie)).data.status, 'WAITING_MAX');
    const binding = await f.gateway.messengerBinding.findUniqueOrThrow({ where: { ownerId_channel: { ownerId: f.owner.id, channel: 'MAX' } } });
    const verified = await request(portalUrl, '/v1/webhooks/max', { update_type: 'bot_started', payload, user: { user_id: binding.externalUserId } }, undefined, undefined, { 'x-max-bot-api-secret': process.env.MAX_WEBHOOK_SECRET });
    assert.equal(verified.status, 200); assert.equal(verified.data.handled, true);
    let registrationState;
    for (let i = 0; i < 50; i++) { registrationState = await request(portalUrl, '/v1/portal/grooming/registration', undefined, registrationCookie); if (registrationState.data.status === 'READY') break; await pause(200); }
    assert.equal(registrationState.data.status, 'READY');
    const session = await request(portalUrl, '/v1/portal/grooming/registration/session', {}, registrationCookie, portalUrl);
    assert.equal(session.status, 201); assert.match(session.headers.get('set-cookie'), /HttpOnly/i);
    const verifiedOwner = await request(portalUrl, '/v1/portal/me', undefined, session.headers.get('set-cookie').split(';')[0]);
    assert.equal(verifiedOwner.status, 200); assert.equal(verifiedOwner.data.ownerId, f.owner.id);
    assert.equal((await request(portalUrl, '/v1/portal/grooming/registration/session', {}, registrationCookie, portalUrl)).status, 403);
  });
  await t.test('two real queued confirmations for one interval create one durable reservation', async () => {
    const a = await result(ownerCookie, await operation(ownerCookie, 'OPTIONS', f.options));
    const b = await result(otherCookie, await operation(otherCookie, 'OPTIONS', { ...f.options, animalId: f.otherAnimal.id }));
    assert.equal(a.status, 'DONE'); assert.equal(b.status, 'DONE');
    const offer = a.result.offers[0], competitor = b.result.offers.find(o => o.startsAt === offer.startsAt);
    assert.ok(competitor);
    const bookInput = o => ({ offerToken: o.offerToken, notes: 'HTTP проверка', looks: ['maltipoo:shape'], contactConsent: true, bookingConsent: true });
    const requests = await Promise.all([operation(ownerCookie, 'BOOK', bookInput(offer)), operation(otherCookie, 'BOOK', bookInput(competitor))]);
    const finished = await Promise.all(requests.map((item, index) => result(index ? otherCookie : ownerCookie, item)));
    assert.equal(finished.filter(item => item.status === 'DONE').length, 1);
    assert.equal(finished.filter(item => item.status === 'FAILED').length, 1);
    assert.equal(await f.prisma.groomingReservation.count({ where: { employeeId: f.groomer.id, startsAt: new Date(offer.startsAt) } }), 1);
    const winner = finished.findIndex(item => item.status === 'DONE'), winnerCookie = winner ? otherCookie : ownerCookie;
    const replay = await operation(winnerCookie, 'BOOK', bookInput(winner ? competitor : offer), requests[winner].clientKey);
    assert.equal(replay.id, requests[winner].id);
    const state = await result(winnerCookie, await operation(winnerCookie, 'STATE'));
    assert.ok(state.result.bookings.some(item => item.id === finished[winner].result.id));
    const cancelled = await result(winnerCookie, await operation(winnerCookie, 'CANCEL', { reservationId: finished[winner].result.id, version: finished[winner].result.version }));
    assert.equal(cancelled.status, 'DONE'); assert.equal(cancelled.result.status, 'CANCELLED');
    assert.equal(await f.prisma.groomingNotification.count({ where: { reservationId: finished[winner].result.id, event: 'REMINDER', status: 'QUEUED' } }), 0);
    for (let i = 0; i < 25 && !f.max.sent.some(item => item.text.includes('запись отменена')); i++) await pause(250);
    assert.ok(f.max.sent.some(item => item.text.includes('запись отменена')));
  });
  await t.test('remote groomer enrolls a trusted phone, changes only own booking and loses access on revocation', async () => {
    process.env.REMOTE_STAFF_PUBLIC_URL = 'https://grooming-remote.example.invalid';
    process.env.REMOTE_ACCESS_GATEWAY_SECRET = 'synthetic-grooming-remote-gateway-secret';
    const headers = { 'x-temichevvet-remote-access': '1', 'x-temichevvet-gateway-secret': process.env.REMOTE_ACCESS_GATEWAY_SECRET };
    const { RemoteAccessService } = require('../apps/api/dist/modules/remote-access/remote-access.service.js');
    const remote = api.get(RemoteAccessService);
    await remote.updatePolicy({ enabled: true }, f.director.id);
    const invite = await remote.createInvitation({ employeeId: f.groomer.id, deviceName: 'QA Android without USB' }, f.director.id);
    assert.equal((await request(apiUrl, '/auth/login', { login: f.groomer.email, password: qaPassword }, undefined, undefined, headers)).status, 401);
    const paired = await request(apiUrl, '/v1/remote-access/enroll', { code: invite.code }, undefined, undefined, headers);
    assert.equal(paired.status, 200, JSON.stringify(paired.data));
    const deviceCookie = paired.headers.get('set-cookie').split(';')[0];
    assert.equal((await request(apiUrl, '/v1/remote-access/enroll', { code: invite.code }, undefined, undefined, headers)).status, 400);
    const signed = await request(apiUrl, '/auth/login', { login: f.groomer.email, password: qaPassword }, deviceCookie, undefined, headers);
    assert.equal(signed.status, 200, JSON.stringify(signed.data));
    const cookie = deviceCookie + '; ' + signed.headers.get('set-cookie').split(';')[0];
    assert.equal((await request(apiUrl, '/auth/me', undefined, cookie, undefined, headers)).data.accessType, 'REMOTE');
    const option = (await f.service.options(f.owner.id, f.options)).offers[0];
    const own = await f.service.book(f.owner.id, { clientKey: randomUUID(), offerToken: option.offerToken, notes: '', looks: [], contactConsent: true, bookingConsent: true });
    const otherOption = (await f.service.options(f.owner.id, { ...f.options, specialistId: f.secondSpecialist.id })).offers[0];
    const other = await f.service.book(f.owner.id, { clientKey: randomUUID(), offerToken: otherOption.offerToken, notes: '', looks: [], contactConsent: true, bookingConsent: true });
    const body = { clientKey: randomUUID(), version: own.version, status: 'ARRIVED' };
    assert.equal((await request(apiUrl, `/v1/grooming/bookings/${other.id}/status`, { ...body, version: other.version }, cookie, undefined, headers)).status, 404);
    const changed = await request(apiUrl, `/v1/grooming/bookings/${own.id}/status`, body, cookie, undefined, headers);
    assert.equal(changed.status, 201, JSON.stringify(changed.data));
    assert.equal(changed.data.status, 'ARRIVED');
    assert.equal((await request(apiUrl, '/v1/grooming/specialists', {}, cookie, undefined, headers)).status, 403);
    await remote.revokeDevice(paired.data.device.id, f.director.id);
    assert.equal((await request(apiUrl, '/v1/grooming/overview', undefined, cookie, undefined, headers)).status, 401);
    delete process.env.REMOTE_STAFF_PUBLIC_URL;
    delete process.env.REMOTE_ACCESS_GATEWAY_SECRET;
  });

});
