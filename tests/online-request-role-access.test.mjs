import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { Reflector } = require('@nestjs/core');
const { OnlineRequestsController } = require('../apps/api/dist/modules/online-requests/online-requests.controller.js');
const { PermissionsGuard } = require('../apps/api/dist/modules/auth/permissions.guard.js');

test('site requests API admits only administrator and director, while public creation remains public', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);
  const controller = OnlineRequestsController;
  for (const method of Object.getOwnPropertyNames(controller.prototype).filter(name => name !== 'constructor')) {
    const handler = controller.prototype[method];
    const context = roles => ({ getHandler: () => handler, getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ auth: { employee: { roles, permissions: ['appointments.read', 'appointments.manage'] } } }) }) });
    if (method === 'createRequest') {
      assert.equal(guard.canActivate(context([])), true);
      continue;
    }
    assert.throws(() => guard.canActivate(context(['doctor'])), /директору/);
    if (method === 'takeover') assert.throws(() => guard.canActivate(context(['administrator'])), /директору/);
    else assert.equal(guard.canActivate(context(['administrator'])), true);
    assert.equal(guard.canActivate(context(['director'])), true);
  }
});

test('site requests route is hidden from doctors even with appointment permissions', () => {
  const ts = require('typescript');
  const source = readFileSync('apps/web/src/auth/access.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)(() => ({ hasPermission: (employee, permission) => employee?.permissions.includes(permission) }), exports);
  const employee = roles => ({ roles, permissions: ['appointments.read', 'appointments.manage'] });
  assert.equal(exports.canAccessPath(employee(['doctor']), '/online-requests'), false);
  assert.equal(exports.canAccessPath(employee(['administrator']), '/online-requests'), true);
  assert.equal(exports.canAccessPath(employee(['director']), '/online-requests'), true);
});
