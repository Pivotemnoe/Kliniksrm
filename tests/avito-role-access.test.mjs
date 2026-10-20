import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { Reflector } = require('@nestjs/core');
const { PermissionsGuard } = require('../apps/api/dist/modules/auth/permissions.guard.js');
const { AvitoController, AvitoEventsController } = require('../apps/api/dist/modules/avito/avito.controller.js');
const { ClinicModulesController } = require('../apps/api/dist/modules/clinic-modules/clinic-modules.controller.js');
const guard = new PermissionsGuard(new Reflector());
const employee = (role, permissions = ['avito.read', 'avito.operate', 'avito.manage']) => ({ roles: [role], permissions });
function allowed(controller, method, actor) { return guard.canActivate({ getHandler: () => controller.prototype[method], getClass: () => controller, switchToHttp: () => ({ getRequest: () => ({ auth: { employee: actor } }) }) }); }
test('director manages the addon; administrators process conversations without prompt or connection privileges', () => {
  const adminMethods = new Set(['overview', 'inquiries', 'conversations', 'conversation', 'metrics', 'call', 'mode', 'reply', 'reconcile', 'inquiryStatus', 'newCycle']);
  for (const method of Object.getOwnPropertyNames(AvitoController.prototype).filter(m => m !== 'constructor')) {
    assert.equal(allowed(AvitoController, method, employee('director')), true);
    assert.throws(() => allowed(AvitoController, method, employee('doctor')));
    if (adminMethods.has(method)) assert.equal(allowed(AvitoController, method, employee('administrator', ['avito.read', 'avito.operate'])), true);
    else assert.throws(() => allowed(AvitoController, method, employee('administrator')));
  }
  assert.throws(() => allowed(ClinicModulesController, 'update', employee('administrator')));
  assert.equal(allowed(ClinicModulesController, 'update', employee('director')), true);
  assert.throws(() => allowed(AvitoController, 'reply', employee('administrator', ['avito.read'])));
});
test('event route is public only at session layer and separate from staff-role metadata', () => {
  const reflector = new Reflector();
  assert.equal(reflector.getAllAndOverride('isPublic', [AvitoEventsController.prototype.event, AvitoEventsController]), true);
  assert.equal(reflector.getAllAndOverride('isPublic', [AvitoController.prototype.overview, AvitoController]), undefined);
});
test('browser routes enforce the same role and addon permission boundaries', () => {
  const ts = require('typescript'); const exports = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync('apps/web/src/auth/access.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(() => ({ hasPermission: (e, p) => e?.permissions.includes(p) }), exports);
  assert.equal(exports.canAccessPath(employee('director'), '/avito'), true);
  assert.equal(exports.canAccessPath(employee('administrator'), '/avito'), true);
  assert.equal(exports.canAccessPath(employee('doctor'), '/avito'), false);
  assert.equal(exports.canAccessPath(employee('administrator'), '/settings/modules'), false);
  assert.equal(exports.canAccessPath(employee('director', []), '/settings/modules'), false);
});
