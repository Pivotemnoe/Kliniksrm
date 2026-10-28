const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const req = createRequire('/app/apps/api/package.json'); req('reflect-metadata');
const { PrismaClient } = req('@prisma/client'), { Reflector } = req('@nestjs/core');
const db = new PrismaClient(), url = new URL(process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/restore_test' || url.username !== 'restore_test') throw Error('Isolated restored database required');
const load = path => req('/app/apps/api/dist/modules/' + path + '.js');
const { AuthService } = load('auth/auth.service'), { AuthController } = load('auth/auth.controller');
const { PasswordService } = load('auth/password.service'), { SessionAuthGuard } = load('auth/session-auth.guard');
const { AuditService } = load('audit/audit.service'), { StaffAppService } = load('staff-app/staff-app.service');
const ROLLBACK = new Error('QUALIFICATION_ROLLBACK_ONLY');
const checks = [];
function ok(name) { checks.push(name); }
async function rejects(run, code) { try { await run(); assert.fail('Expected rejection'); } catch (e) { assert.equal(e.getStatus?.(), code); } }
(async () => {
  process.env.REMOTE_STAFF_PUBLIC_URL = 'https://staff-restore.invalid';
  process.env.REMOTE_ACCESS_GATEWAY_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  try {
    await db.$transaction(async tx => {
      const shim = new Proxy(tx, { get(target, key) { if (key === '$transaction') return async work => typeof work === 'function' ? work(shim) : Promise.all(work); const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; } });
      const passwords = new PasswordService(), audit = new AuditService(shim), auth = new AuthService(shim, passwords, audit);
      const controller = new AuthController(auth), guard = new SessionAuthGuard(new Reflector(), shim, auth, audit);
      const staff = new StaffAppService(shim, audit, auth, {}, {}, {}, {});
      const originalCounts = { users: await tx.user.count(), employees: await tx.employee.count(), invitations: await tx.remoteAccessInvitation.count() };
      const include = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissionOverrides: { include: { permission: true } } };
      const pass = crypto.randomBytes(24).toString('base64url'), passwordHash = await passwords.hashPassword(pass);
      const actors = {};
      for (const role of ['director', 'doctor', 'groomer']) {
        const source = await tx.employee.findFirst({ where: { status: 'ACTIVE', roles: { some: { role: { code: role } } } }, include });
        assert.ok(source, 'Existing operational role must exist');
        let normalized;
        do { normalized = '7000' + String(crypto.randomInt(0, 10_000_000)).padStart(7, '0'); }
        while (await tx.user.findFirst({ where: { OR: [{ phone: '+' + normalized }, { phoneNormalized: normalized }] } }));
        const employee = await tx.employee.create({ data: { fullName: 'Изолированная квалификация · ' + role, accountScope: source.accountScope,
          user: { create: { phone: '+' + normalized, phoneNormalized: normalized, passwordHash, mustChangePassword: false } },
          roles: { create: source.roles.map(item => ({ roleId: item.roleId })) },
          permissionOverrides: { create: source.permissionOverrides.map(item => ({ permissionId: item.permissionId, effect: item.effect })) },
        }, include });
        const expected = auth.serializeEmployee(source, false), actual = auth.serializeEmployee(employee, false);
        assert.deepEqual([...actual.roles].sort(), [...expected.roles].sort()); assert.deepEqual([...actual.permissions].sort(), [...expected.permissions].sort());
        actors[role] = { employee, phone: '+' + normalized, installationId: crypto.randomUUID() };
      }
      ok('isolated actors preserve existing director doctor groomer rights');
      const policy = await tx.remoteAccessPolicy.findFirst(); assert.ok(policy?.enabled, 'Existing clinic remote policy must remain enabled');
      const request = cookies => ({ method: 'POST', path: '/api/auth/staff-login', ip: '127.0.0.1', headers: { host: 'staff-restore.invalid', cookie: cookies || '', 'user-agent': 'isolated-staff-release-qualification', 'x-temichevvet-remote-access': '1', 'x-temichevvet-gateway-secret': process.env.REMOTE_ACCESS_GATEWAY_SECRET } });
      const login = async actor => {
        const jar = new Map(), response = { cookie(name, value, options) { assert.equal(options.httpOnly, true); jar.set(name, value); } };
        const body = await controller.staffLogin({ login: actor.phone, password: pass, installationId: actor.installationId, deviceName: 'Изолированная квалификация' }, request(), response);
        return { body, jar, cookie: () => [...jar].map(([name, value]) => name + '=' + value).join('; ') };
      };
      const guardMe = async state => { const requestMe = request(state.cookie()); requestMe.method = 'GET'; requestMe.path = '/api/auth/me'; const ctx = { getHandler: () => AuthController.prototype.me, getClass: () => AuthController, switchToHttp: () => ({ getRequest: () => requestMe }) }; assert.equal(await guard.canActivate(ctx), true); return controller.me(requestMe); };
      const beforeBad = await tx.remoteAccessDevice.count();
      await rejects(() => controller.staffLogin({ login: actors.doctor.phone, password: 'Wrong-password-qualification', installationId: actors.doctor.installationId }, request(), { cookie() { assert.fail(); } }), 401);
      assert.equal(await tx.remoteAccessDevice.count(), beforeBad); ok('wrong password creates no device');
      for (const role of ['director', 'doctor', 'groomer']) {
        const state = await login(actors[role]); actors[role].state = state;
        assert.equal(state.body.employee.id, actors[role].employee.id); assert.equal(state.body.accessType, 'REMOTE'); assert.equal(state.jar.size, 2);
        const me = await guardMe(state); assert.equal(me.employee.id, actors[role].employee.id);
        assert.equal(staff.profile(me.employee).settings.enabled, true); ok(role + ' phone password and actual remote session guard');
      }
      const devices = await tx.remoteAccessDevice.count(); await login(actors.doctor); assert.equal(await tx.remoteAccessDevice.count(), devices); ok('same installation produces no duplicate device');
      await rejects(() => controller.login({ login: actors.director.phone, password: pass }, request(), { cookie() { assert.fail(); } }), 401); ok('legacy web trust policy preserved');
      const deviceToken = actors.doctor.state.jar.get('temichevvet_remote_device');
      const remote = await tx.remoteAccessDevice.findUniqueOrThrow({ where: { tokenHash: auth.hashSessionToken(deviceToken) } });
      await tx.remoteAccessDevice.update({ where: { id: remote.id }, data: { revokedAt: new Date() } });
      await rejects(() => guardMe(actors.doctor.state), 401); await rejects(() => login(actors.doctor), 401); ok('revoked device and stable installation both denied');
      assert.equal(await tx.remoteAccessInvitation.count(), originalCounts.invitations); ok('no invitation is created');
      assert.equal(await tx.user.count(), originalCounts.users + 3); assert.equal(await tx.employee.count(), originalCounts.employees + 3);
      throw ROLLBACK;
    }, { timeout: 120_000, maxWait: 10_000 });
  } catch (e) { if (e !== ROLLBACK) throw e; }
  console.log(JSON.stringify({ candidateQualified: true, checks, count: checks.length, allMutationsRolledBack: true, productionAccess: false, externalMessagesSent: false }));
})().catch(e => { console.error('Staff restored-copy qualification failed: ' + String(e.message).slice(0, 220)); process.exitCode = 1; }).finally(() => db.$disconnect());
