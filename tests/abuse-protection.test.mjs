import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { validate } from 'class-validator';
import { BoundedRateLimiter, gatewayAbuseProtection } from '../apps/owner-gateway/dist/abuse-protection.js';
import { apiAbuseProtection, apiBodyParsers, limitStaffMutation } from '../apps/api/dist/common/abuse-protection.js';
import { BoundedRateLimiter as ApiLimiter } from '../apps/api/dist/common/abuse-protection.js';
import { ClinicChatController } from '../apps/owner-gateway/dist/clinic-chat.controller.js';
import { ClinicChatBookingDto } from '../apps/owner-gateway/dist/dto/clinic-chat.dto.js';
import { CreatePublicClinicInquiryDto } from '../apps/owner-gateway/dist/dto/create-public-clinic-inquiry.dto.js';
import { CreateOnlineRequestDto } from '../apps/api/dist/modules/online-requests/dto/create-online-request.dto.js';
import { contactPhone } from '../apps/owner-gateway/dist/clinic-contact.js';

for (const Limiter of [BoundedRateLimiter, ApiLimiter]) test(`${Limiter === ApiLimiter ? 'API' : 'gateway'} active penalties survive capacity pressure`, () => {
  let now = 0; const rate = new Limiter(10, () => now);
  rate.consume('blocked', 1); assert.throws(() => rate.consume('blocked', 1), e => e.getStatus() === 429);
  for (let i = 0; i < 9; i++) rate.consume(`other:${i}`, 1);
  assert.throws(() => rate.consume('new-identity', 1), e => e.getStatus() === 429);
  assert.throws(() => rate.consume('blocked', 1), e => e.getStatus() === 429);
  now = 600001; assert.doesNotThrow(() => rate.consume('blocked', 1));
});
async function server(t, middleware, bodyParser) {
  const app = express(); app.set('trust proxy', 1); app.use(middleware);
  if (bodyParser) app.use(bodyParser);
  app.use((_req, res) => res.json({ ok: true }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ status: error.status }));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  t.after(() => new Promise(resolve => listener.close(resolve)));
  return `http://127.0.0.1:${listener.address().port}`;
}
const post = (base, path, body = {}, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('gateway case/trailing aliases and forged earlier XFF share one chat quota; reads remain available', async t => {
  const base = await server(t, gatewayAbuseProtection());
  for (let i = 0; i < 20; i++) assert.equal((await post(base, i % 2 ? '/V1/PUBLIC/ASSISTANT/MESSAGES/' : '/v1/public/assistant/messages', {}, { 'x-forwarded-for': `198.51.100.${i}, 203.0.113.5` })).status, 200);
  const limited = await post(base, '/v1/public/assistant/messages', {}, { 'x-forwarded-for': 'new-spoof, 203.0.113.5' });
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await fetch(base + '/v1/public/assistant', { headers: { 'x-forwarded-for': '203.0.113.5' } })).status, 200);
});
test('gateway public chunked body is bounded; authenticated internal uploads preserve larger limit', async t => {
  process.env.OWNER_GATEWAY_SYNC_SECRET = 'synthetic-security-sync-secret-only-123456';
  const base = await server(t, gatewayAbuseProtection());
  const data = JSON.stringify({ text: 'x'.repeat(80_000) });
  const chunked = await fetch(base + '/v1/public/clinic/inquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(data)); c.close(); } }), duplex: 'half' });
  assert.equal(chunked.status, 413);
  assert.equal((await post(base, '/internal/v1/owners/test/documents/sync', { text: 'x'.repeat(80_000) })).status, 403);
  assert.equal((await post(base, '/internal/v1/owners/test/documents/sync', { text: 'x'.repeat(80_000) }, { 'x-owner-gateway-secret': process.env.OWNER_GATEWAY_SYNC_SECRET })).status, 200);
});
test('API public forms, login aliases and OTP share strict quotas while chunked bodies stay bounded', async t => {
  const base = await server(t, apiAbuseProtection(), apiBodyParsers('25mb'));
  for (let i = 0; i < 30; i++) assert.equal((await post(base, i % 2 ? '/API/AUTH/LOGIN/' : '/api/v1/client-portal/auth/request-code', {}, { 'x-forwarded-for': `spoof-${i}, 203.0.113.9` })).status, 200);
  assert.equal((await post(base, '/api/auth/login', {}, { 'x-forwarded-for': '203.0.113.9' })).status, 429);
  for (let i = 0; i < 10; i++) assert.equal((await post(base, i % 2 ? '/API/V1/ONLINE-REQUESTS/' : '/api/v1/client-portal/token/online-requests', {}, { 'x-forwarded-for': '203.0.113.10' })).status, 200);
  assert.equal((await post(base, '/api/v1/online-requests', {}, { 'x-forwarded-for': '203.0.113.10' })).status, 429);
  const data = JSON.stringify({ text: 'x'.repeat(80_000) });
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' }, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(data)); c.close(); } }), duplex: 'half' });
  assert.equal(response.status, 413);
});
test('verified staff budgets are separate per user; normal forms and read polling remain usable', () => {
  const req = id => ({ auth: { userId: id }, method: 'POST' });
  for (let i = 0; i < 300; i++) limitStaffMutation(req('synthetic-staff-A'));
  assert.throws(() => limitStaffMutation(req('synthetic-staff-A')), e => e.getStatus() === 429);
  assert.doesNotThrow(() => limitStaffMutation(req('synthetic-staff-B')));
  assert.doesNotThrow(() => limitStaffMutation({ ...req('synthetic-staff-A'), method: 'GET' }));
});
test('remote edge client prefixes cannot rotate IP quotas through two authenticated hops', async t => {
  process.env.REMOTE_ACCESS_GATEWAY_SECRET = 'synthetic-remote-edge-secret-only-123456789';
  const base = await server(t, apiAbuseProtection(), apiBodyParsers('25mb'));
  const headers = i => ({ 'x-temichevvet-remote-access': '1', 'x-temichevvet-gateway-secret': process.env.REMOTE_ACCESS_GATEWAY_SECRET, 'x-forwarded-for': `spoof-${i}, 203.0.113.15, 172.20.0.1` });
  for (let i = 0; i < 30; i++) assert.equal((await post(base, '/api/auth/login', {}, headers(i))).status, 200);
  assert.equal((await post(base, '/API/AUTH/LOGIN/', {}, headers(31))).status, 429);
});
test('reopening the current valid chat does not create sessions or consume creation quota', async () => {
  let creations = 0;
  const controller = new ClinicChatController({ readPublic: async () => ({ id: 'existing' }), start: async () => { creations++; } }, {}, {});
  for (let i = 0; i < 30; i++) assert.equal((await controller.start({ ip: 'synthetic-ip', headers: { cookie: 'clinic_assistant_session=valid' } }, {})).id, 'existing');
  assert.equal(creations, 0);
});
test('all public phone DTOs reject punctuation-only input and accept ordinary Russian formatting', async () => {
  for (const Dto of [ClinicChatBookingDto, CreatePublicClinicInquiryDto, CreateOnlineRequestDto]) {
    const invalid = await validate(Object.assign(new Dto(), { phone: '----------' }));
    assert.ok(invalid.some(e => e.property === 'phone'));
    const valid = await validate(Object.assign(new Dto(), { phone: '+7 (999) 000-00-01' }));
    assert.ok(!valid.some(e => e.property === 'phone'));
  }
  assert.equal(contactPhone('8 (999) 000-00-01'), '+79990000001');
  assert.throws(() => contactPhone('----------'), e => e.getStatus() === 400);
});
