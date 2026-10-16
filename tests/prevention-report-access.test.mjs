import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { ReportsController } = require('../apps/api/dist/modules/reports/reports.controller.js');
const { ReportsService } = require('../apps/api/dist/modules/reports/reports.service.js');
const { PreventionReportsService } = require('../apps/api/dist/modules/reports/prevention-reports.service.js');
const { PermissionsGuard } = require('../apps/api/dist/modules/auth/permissions.guard.js');
const { StaffAlertsService } = require('../apps/api/dist/modules/staff-alerts/staff-alerts.service.js');
const rights = {
  administrator: ['reports.prevention.read', 'reports.prevention.generate'],
  reader: ['reports.prevention.read'], doctor: ['animals.manage'],
  director: ['settings.read', 'settings.manage'],
};

test('actual report routes enforce packet-only administrator access, read-only grants and legacy director rights', async () => {
  const calls = [];
  const record = name => (...args) => { calls.push([name, ...args]); return { ok: true }; };
  class FixtureModule {}
  Module({ controllers: [ReportsController], providers: [
    { provide: ReportsService, useValue: { getSummary: record('summary') } },
    { provide: PreventionReportsService, useValue: {
      list: record('list'), getSettings: record('settings'), saveSettings: record('save'), get: record('detail'),
      generate: record('generate'), document: async () => ({ month: '2026-09', revision: 1, document: Buffer.from('fixture-docx') }),
    } },
  ] })(FixtureModule);
  const app = await NestFactory.create(FixtureModule, { logger: false });
  // Isolate identity only; the production controller, permissions guard and validation remain real.
  app.use((req, _res, next) => { req.auth = { employee: { id: 'fixture', roles: [req.headers['x-fixture-role']], permissions: rights[req.headers['x-fixture-role']] ?? [] } }; next(); });
  app.useGlobalGuards(new PermissionsGuard(new Reflector()));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  try {
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const call = (role, path, body, method = 'POST') => fetch(base + '/v1/reports/' + path, { method: body === undefined ? 'GET' : method, headers: { 'x-fixture-role': role, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const role of ['administrator', 'reader', 'director']) {
      for (const path of ['prevention', 'prevention/settings', 'prevention/fixture', 'prevention/fixture/docx']) assert.equal((await call(role, path)).status, 200, `${role} ${path}`);
    }
    for (const path of ['prevention', 'prevention/settings', 'prevention/fixture', 'prevention/fixture/docx']) assert.equal((await call('doctor', path)).status, 403);
    for (const role of ['administrator', 'director']) assert.equal((await call(role, 'prevention/generate', { month: '2026-09', regenerate: true })).status, 201);
    for (const role of ['reader', 'doctor']) assert.equal((await call(role, 'prevention/generate', { month: '2026-09' })).status, 403);
    for (const role of ['administrator', 'reader', 'doctor']) {
      assert.equal((await call(role, 'summary')).status, 403);
      assert.equal((await call(role, 'prevention/settings', {}, 'PUT')).status, 403);
    }
    assert.equal((await call('director', 'summary')).status, 200);
    const settings = { enabled: true, time: '09:00', timezone: 'Europe/Moscow', profiles: [], signatories: [] };
    assert.equal((await call('director', 'prevention/settings', settings, 'PUT')).status, 200);
    assert.equal((await call('administrator', 'prevention/generate', { month: '2026-13' })).status, 400);
    assert.equal((await call('administrator', 'prevention/generate', { month: '2026-09', injected: true })).status, 400);
    assert.equal(calls.filter(([name]) => name === 'generate').length, 2);
    assert.equal(calls.filter(([name]) => name === 'save').length, 1);
    assert.equal(calls.filter(([name]) => name === 'summary').length, 1);
  } finally { await app.close(); }
});

test('packet alert is visible to administrator and read-only report users, hidden from doctor', async () => {
  let reads = 0;
  const empty = { findMany: async () => [] };
  const prisma = { visit: empty, vaccination: empty, staffAlertRead: empty, monthlyPreventionReport: { findMany: async () => { reads++; return [{ id: 'report', month: '2026-09', revision: 1, status: 'NEEDS_REVIEW', createdAt: new Date() }]; } } };
  const service = new StaffAlertsService(prisma, {});
  for (const role of ['administrator', 'reader']) {
    const result = await service.list({ id: role, roles: [role], permissions: rights[role] });
    assert.equal(result.items.length, 1); assert.equal(result.items[0].kind, 'PREVENTION_REPORT');
    assert.equal(result.items[0].href, '/vaccination-reports'); assert.equal(result.items[0].unread, true);
  }
  assert.equal((await service.list({ id: 'doctor', roles: ['doctor'], permissions: rights.doctor })).items.length, 0);
  assert.equal(reads, 2);
});

test('browser route rules isolate the packet from finance and clinic settings', () => {
  const ts = require('typescript');
  const source = readFileSync('apps/web/src/auth/access.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)(() => ({ hasPermission: (employee, permission) => employee?.permissions.includes(permission) }), exports);
  for (const role of ['administrator', 'reader', 'director']) assert.equal(exports.canAccessPath({ permissions: rights[role], roles: [role] }, '/vaccination-reports'), true);
  for (const path of ['/reports', '/reports?from=2026-09-01', '/settings/organization', '/settings/finance']) assert.equal(exports.canAccessPath({ permissions: rights.administrator, roles: ['administrator'] }, path), false);
  assert.equal(exports.canAccessPath({ permissions: rights.doctor, roles: ['doctor'] }, '/vaccination-reports'), false);
});
