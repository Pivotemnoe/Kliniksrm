import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '../apps/owner-gateway/src/generated/client/index.js';
import { AppModule } from '../apps/owner-gateway/dist/app.module.js';
import { hashToken } from '../apps/owner-gateway/dist/security.js';
import { setGatewaySecurityHeaders } from '../apps/owner-gateway/dist/security-headers.js';

const databaseUrl = process.env.ASSISTANT_TEST_GATEWAY_DATABASE_URL;
test('isolated PostgreSQL: public chat entry, owner isolation and logout', { skip: !databaseUrl }, async t => {
  const parsed = new URL(databaseUrl);
  assert.equal(parsed.hostname, '127.0.0.1'); assert.equal(parsed.port, '15488'); assert.equal(parsed.pathname, '/crm_assistant_gateway_qa');
  Object.assign(process.env, { OWNER_GATEWAY_DATABASE_URL: databaseUrl, CLINIC_ASSISTANT_ENABLED: 'true', CLINIC_ASSISTANT_MODEL_ENABLED: 'false', CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED: 'true', OWNER_GATEWAY_COOKIE_SECURE: 'false', MAX_BOT_TOKEN: '', TELEGRAM_BOT_TOKEN: '', OWNER_GATEWAY_VAPID_PUBLIC_KEY: '', OWNER_GATEWAY_VAPID_PRIVATE_KEY: '' });
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const owners = [];
  for (let index = 0; index < 2; index++) {
    const ownerId = `public_entry_qa_${randomUUID()}`; const token = randomBytes(32).toString('hex');
    await db.ownerSnapshot.create({ data: { ownerId, displayName: 'Вымышленный владелец', payload: { animals: [] }, sourceVersion: 'synthetic', sourceUpdatedAt: new Date() } });
    await db.portalSession.create({ data: { ownerId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } });
    owners.push({ ownerId, token });
  }
  const app = await NestFactory.create(AppModule, { logger: false });
  app.use((_request, response, next) => { setGatewaySecurityHeaders(response); next(); });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  t.after(async () => { await app.close(); await db.$disconnect(); });
  const request = (path, cookie = '', body) => fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const portal = index => `temichevvet_owner_session=${owners[index].token}`;
  const start = async cookie => {
    const response = await request('/v1/public/assistant/session', cookie, {});
    assert.equal(response.status, 201);
    const setCookie = response.headers.get('set-cookie');
    return { data: await response.json(), chat: setCookie?.split(';')[0] };
  };
  await t.test('public page and bundle load without employee login under a fresh scoped CSP', async () => {
    const first = await request('/assistant'), second = await request('/assistant');
    assert.equal(first.status, 200); assert.equal(second.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store'); assert.match(first.headers.get('x-robots-tag'), /noindex/);
    const html = await first.text(); const nonce = /name="clinic-csp-nonce" content="([^"]+)"/.exec(html)?.[1];
    assert.ok(nonce); assert.ok(!html.includes('__CLINIC_CSP_NONCE__'));
    assert.match(first.headers.get('content-security-policy'), new RegExp(`nonce-${nonce.replace(/[+]/g, '\\+')}`));
    assert.notEqual(first.headers.get('content-security-policy'), second.headers.get('content-security-policy'));
    assert.match(first.headers.get('content-security-policy'), /script-src 'self';/); assert.equal(first.headers.get('x-frame-options'), 'DENY');
    const script = /src="(\/assistant\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    assert.ok(script); const bundle = await request(script); assert.equal(bundle.status, 200);
    assert.match(bundle.headers.get('content-type'), /javascript/); assert.match(bundle.headers.get('cache-control'), /immutable/);
    const content = await bundle.text(); assert.ok(content.includes('/v1/public/assistant')); assert.ok(!content.includes('/api/auth/login'));
    const privatePortal = await request('/portal');
    assert.equal(privatePortal.status, 200); assert.ok(!privatePortal.headers.get('content-security-policy').includes('unsafe-inline'));
    process.env.CLINIC_ASSISTANT_ENABLED = 'false';
    assert.equal((await request('/assistant')).status, 404); assert.equal((await request(script)).status, 404);
    process.env.CLINIC_ASSISTANT_ENABLED = 'true';
  });
  const first = await start(portal(0)); assert.equal(first.data.ownerId, owners[0].ownerId); assert.ok(first.chat);
  await t.test('owner history and all public chat mutations require the same active portal owner', async () => {
    const own = `${portal(0)}; ${first.chat}`;
    assert.equal((await request('/v1/public/assistant/messages', own, { clientKey: 'public_owner_private_0001', text: 'QA_PRIVATE_OWNER_A_MARKER' })).status, 201);
    assert.equal((await request('/v1/public/assistant', own)).status, 200);
    for (const cookie of [first.chat, `${portal(1)}; ${first.chat}`]) {
      const read = await request('/v1/public/assistant', cookie);
      assert.equal(read.status, 401); assert.ok(!(await read.text()).includes('QA_PRIVATE_OWNER_A_MARKER'));
      for (const [path, body] of [
        ['/messages', { clientKey: 'public_blocked_message01', text: 'Где вы?' }],
        ['/booking', { clientKey: 'public_blocked_booking01', contactName: 'QA', phone: '+79990000001', animalNickname: 'QA', comment: 'QA', contactConsent: true }],
        ['/max-link', {}], ['/max-disconnect', {}],
      ]) assert.equal((await request(`/v1/public/assistant${path}`, cookie, body)).status, 401);
    }
    const changed = await start(`${portal(1)}; ${first.chat}`);
    assert.notEqual(changed.data.id, first.data.id); assert.equal(changed.data.ownerId, owners[1].ownerId);
    assert.ok(!JSON.stringify(changed.data).includes('QA_PRIVATE_OWNER_A_MARKER'));
  });
  await t.test('guest chat remains usable; signing in creates a separate owner conversation', async () => {
    const guest = await start('temichevvet_owner_session=expired-synthetic'); assert.equal(guest.data.ownerId, null);
    assert.equal((await request('/v1/public/assistant', guest.chat)).status, 200);
    assert.equal((await request('/v1/public/assistant', `${portal(0)}; ${guest.chat}`)).status, 401);
    const signedIn = await start(`${portal(0)}; ${guest.chat}`); assert.equal(signedIn.data.ownerId, owners[0].ownerId); assert.notEqual(signedIn.data.id, guest.data.id);
  });
  await t.test('portal entry exposes chat only when enabled; logout clears both cookies and revokes old access', async () => {
    const own = `${portal(0)}; ${first.chat}`;
    const me = await request('/v1/portal/me', own); assert.equal(me.status, 200); assert.equal((await me.json()).assistantEnabled, true);
    process.env.CLINIC_ASSISTANT_ENABLED = 'false';
    assert.equal((await (await request('/v1/portal/me', own)).json()).assistantEnabled, false);
    process.env.CLINIC_ASSISTANT_ENABLED = 'true';
    const logout = await request('/v1/portal/logout', own, {}); assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /clinic_assistant_session=;/); assert.match(logout.headers.get('set-cookie'), /temichevvet_owner_session=;/);
    assert.equal((await request('/v1/public/assistant', own)).status, 401);
    const fresh = await start(own); assert.equal(fresh.data.ownerId, null); assert.notEqual(fresh.data.id, first.data.id);
  });
});
