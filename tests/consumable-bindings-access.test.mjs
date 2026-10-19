import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { PermissionsGuard } = require('../apps/api/dist/modules/auth/permissions.guard.js');
const { ConsumableBindingsController } = require('../apps/api/dist/modules/stock/consumable-bindings.controller.js');
const { ConsumableBindingsService } = require('../apps/api/dist/modules/stock/consumable-bindings.service.js');
test('stock read/manage boundaries and nested DTO validation are enforced by real HTTP routes', async () => {
  const calls = [];
  const handled = name => (...args) => { calls.push({ name, args }); return { ok: true }; };
  class FixtureModule {}
  Module({ controllers: [ConsumableBindingsController], providers: [{ provide: ConsumableBindingsService, useValue: { listSets: handled('list'), preview: handled('preview'), apply: handled('apply'), saveSet: handled('save'), archiveSet: handled('archive') } }] })(FixtureModule);
  const app = await NestFactory.create(FixtureModule, { logger: false });
  // Isolate identity only: production permissions, controller and validation run unchanged.
  app.use((req, _res, next) => { req.auth = { employee: { id: 'actor', roles: [], permissions: req.headers['x-fixture-role'] === 'manage' ? ['stock.manage','stock.read'] : req.headers['x-fixture-role'] === 'read' ? ['stock.read'] : [] } }; next(); });
  app.useGlobalGuards(new PermissionsGuard(new Reflector()));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  try {
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const request = (role, path, body, method = 'POST') => fetch(base + '/v1/stock/' + path, { method: body === undefined ? 'GET' : method, headers: { 'x-fixture-role': role, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const id = randomUUID(), materialId = randomUUID(), binding = { targetKind: 'SERVICE', targetIds: [id], mode: 'MERGE', items: [{ productId: materialId, quantity: 0.25 }] };
    const set = { title: 'Набор QA', serviceIds: [id], productIds: [], items: binding.items };
    for (const role of ['read','manage']) assert.equal((await request(role, 'consumable-sets')).status, 200);
    assert.equal((await request('none', 'consumable-sets')).status, 403);
    for (const [path, body, method] of [['consumable-bindings/preview', binding, 'POST'], ['consumable-bindings', binding, 'PATCH'], ['consumable-sets', set, 'POST'], ['consumable-sets/'+id, set, 'PATCH'], ['consumable-sets/'+id+'/archive', { expectedUpdatedAt: new Date().toISOString() }, 'POST']]) {
      for (const role of ['none','read']) assert.equal((await request(role, path, body, method)).status, 403);
      assert.ok([200,201].includes((await request('manage', path, body, method)).status));
    }
    const before = calls.length;
    for (const bad of [{ ...binding, targetIds: [] }, { ...binding, targetIds: Array(101).fill(id) }, { ...binding, targetIds: [id,id] }, { ...binding, targetKind: 'ALL' }, { ...binding, items: [{ productId: materialId, quantity: -1 }] }, { ...binding, items: [{ productId: materialId, quantity: 0.0001 }] }, { ...binding, items: [{ productId: materialId, quantity: 1, minDoseMl: 0 }] }, { ...binding, unexpected: true }]) assert.equal((await request('manage', 'consumable-bindings/preview', bad)).status, 400);
    assert.equal((await request('manage', 'consumable-sets/not-a-uuid', set, 'PATCH')).status, 400);
    assert.equal((await request('manage', 'consumable-sets/'+id+'/archive', { expectedUpdatedAt: 'wrong' })).status, 400);
    assert.equal(calls.length, before);
  } finally { await app.close(); }
});
