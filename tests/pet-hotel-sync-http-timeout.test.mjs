import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PetHotelSyncService } from '../apps/api/dist/modules/pet-hotel/pet-hotel-sync.service.js';

test('a real storefront HTTP timeout still permits pickup and dispatch in the same cycle', { timeout: 30000 }, async t => {
  const previous = { url: process.env.OWNER_GATEWAY_URL, secret: process.env.OWNER_GATEWAY_SYNC_SECRET, fetch: globalThis.fetch };
  const secret = 'synthetic-hotel-timeout-qa-no-external-send';
  const operation = { id: 'a124b432-cbab-4876-a905-dc098bf0ee99', kind: 'STATE', input: {} };
  const events = [], results = [];
  const server = createServer(async (request, response) => {
    const path = request.url.replace('/internal/v1/pet-hotel/portal', '');
    events.push(`${request.method} ${path}`);
    if (request.headers['x-owner-gateway-secret'] !== secret) {
      response.writeHead(403).end(); return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (path === '/storefront') return; // Let the production ten-second fetch deadline expire.
    let result;
    if (path === '/registrations') result = { items: [] };
    else if (path === '/operations') result = { items: [operation] };
    else if (path === `/operations/${operation.id}/result`) {
      results.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); result = { ok: true };
    } else { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
  });
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [['OWNER_GATEWAY_URL', previous.url], ['OWNER_GATEWAY_SYNC_SECRET', previous.secret]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.OWNER_GATEWAY_URL = base;
  process.env.OWNER_GATEWAY_SYNC_SECRET = secret;
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.origin, base, 'This test may contact only its own loopback server');
    return previous.fetch(input, options);
  };
  const sync = new PetHotelSyncService({}, {
    storefrontSnapshot: async () => ({ synthetic: true }),
    execute: async item => { assert.equal(item.id, operation.id); events.push('EXECUTE STATE'); return { synthetic: true }; },
  }, { publish: () => assert.fail('A STATE read must not publish a clinical mutation') });
  sync.dispatch = async () => { events.push('DISPATCH'); };
  const startedAt = Date.now();
  await sync.syncNow();
  assert.ok(Date.now() - startedAt >= 9500, 'The real production fetch timeout must be exercised');
  assert.deepEqual(events, [
    'POST /storefront', 'GET /registrations', 'GET /operations', 'EXECUTE STATE',
    `POST /operations/${operation.id}/result`, 'DISPATCH',
  ]);
  assert.deepEqual(results, [{ status: 'DONE', result: { synthetic: true } }]);
});
