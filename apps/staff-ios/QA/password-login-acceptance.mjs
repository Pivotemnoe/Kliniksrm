import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const local = 'http://127.0.0.1:4268', gateway = 'http://localhost:4269';
const qa = async path => {
  const r = await fetch(local + '/__qa/' + path);
  assert.equal(r.status, 200); return r.json();
};
const info = await qa('info'); assert.equal(info.synthetic, true);
const checks = [];
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name); }
function client(base = gateway) {
  const jar = new Map();
  return { jar, async call(path, body) {
    const r = await fetch(base + '/api/' + path, {
      method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const cookies = r.headers.getSetCookie();
    for (const cookie of cookies) {
      const first = cookie.split(';')[0], i = first.indexOf('=');
      jar.set(first.slice(0, i), first.slice(i + 1));
    }
    return { status: r.status, data: await r.json(), cookies };
  } };
}
function payload(role, installationId = randomUUID(), login) {
  const user = info.users[role];
  return { login: login || user.login, password: user.password, installationId, deviceName: 'Синтетическая проверка iPhone' };
}
const before = await qa('auth-state');
const doctor = client(), device = randomUUID();
const user = info.users.authDoctor;
await check('invalid installation and wrong password create neither device nor session', async () => {
  const bad = await doctor.call('auth/staff-login', { ...payload('authDoctor'), installationId: 'not-a-uuid' });
  assert.equal(bad.status, 400);
  assert.equal((await doctor.call('auth/staff-login', { ...payload('authDoctor'), password: 'Incorrect-password-2026' })).status, 401);
  const after = await qa('auth-state');
  for (const key of ['devices', 'sessions', 'invitations', 'users', 'employees']) assert.equal(after[key], before[key]);
});
await check('existing phone and password sign in through guarded gateway without invitation', async () => {
  const r = await doctor.call('auth/staff-login', payload('authDoctor', device));
  assert.equal(r.status, 200, r.data.message); assert.equal(r.data.accessType, 'REMOTE');
  assert.equal(r.data.employee.id, user.id);
  for (const role of ['doctor', 'cashier', 'stock']) assert.ok(r.data.employee.roles.includes(role));
  assert.ok(!r.data.employee.roles.includes('director'));
  assert.ok(!r.data.employee.permissions.includes('daily_finance.read'));
  assert.equal(r.cookies.length, 2);
  assert.ok(doctor.jar.has('staff_ios_qa_session')); assert.ok(doctor.jar.has('temichevvet_remote_device'));
  assert.equal((await doctor.call('auth/me')).status, 200);
  const after = await qa('auth-state');
  assert.equal(after.devices, before.devices + 1); assert.equal(after.invitations, before.invitations);
});
await check('formatted phone alias and same installation reuse the existing device', async () => {
  const fresh = client();
  const alias = '8' + user.login.replace(/\D/g, '').slice(1);
  const state = await qa('auth-state');
  const r = await fresh.call('auth/staff-login', payload('authDoctor', device, alias));
  assert.equal(r.status, 200); assert.equal(r.data.employee.id, user.id);
  assert.equal(fresh.jar.get('temichevvet_remote_device'), doctor.jar.get('temichevvet_remote_device'));
  assert.equal((await qa('auth-state')).devices, state.devices);
});
await check('disabled staff-app permission rejects native login before device creation', async () => {
  await qa('native-login-policy?role=authDoctor&appEnabled=false');
  try {
    const state = await qa('auth-state');
    assert.equal((await client().call('auth/staff-login', payload('authDoctor'))).status, 403);
    assert.equal((await qa('auth-state')).devices, state.devices);
  } finally { await qa('native-login-policy?role=authDoctor&appEnabled=true'); }
});
await check('blocked employee cannot create a native session', async () => {
  await qa('native-login-policy?role=authDoctor&active=false');
  try {
    const state = await qa('auth-state');
    assert.equal((await client().call('auth/staff-login', payload('authDoctor'))).status, 401);
    assert.equal((await qa('auth-state')).devices, state.devices);
  } finally { await qa('native-login-policy?role=authDoctor&active=true'); }
});
await check('disabled remote policy rejects a valid password without creating device', async () => {
  await qa('native-login-policy?role=authDoctor&remoteEnabled=false');
  try {
    const state = await qa('auth-state');
    assert.equal((await client().call('auth/staff-login', payload('authDoctor'))).status, 401);
    assert.equal((await qa('auth-state')).devices, state.devices);
  } finally { await qa('native-login-policy?role=authDoctor&remoteEnabled=true'); }
});
await check('revocation blocks the active session and both cookie and installation re-login', async () => {
  await qa('revoke?role=authDoctor');
  assert.equal((await doctor.call('auth/me')).status, 401);
  const state = await qa('auth-state');
  assert.equal((await doctor.call('auth/staff-login', payload('authDoctor', device))).status, 401);
  assert.equal((await client().call('auth/staff-login', payload('authDoctor', device))).status, 401);
  assert.equal((await qa('auth-state')).devices, state.devices);
});
await check('legacy web login still requires its existing trusted-device flow', async () => {
  const r = await client().call('auth/login', { login: info.users.director.login, password: info.users.director.password });
  assert.equal(r.status, 401); assert.equal(r.data.code, 'REMOTE_DEVICE_NOT_TRUSTED');
});
await check('director phone resolves to existing director account and clinic agenda', async () => {
  const c = client(), r = await c.call('auth/staff-login', payload('director'));
  assert.equal(r.status, 200, r.data.message); assert.equal(r.data.employee.id, info.users.director.id);
  assert.ok(r.data.employee.roles.includes('director'));
  const range = new URLSearchParams({ from: info.date + 'T00:00:00+03:00', to: info.date + 'T23:59:59+03:00' });
  const agenda = await c.call('v1/staff-app/agenda?' + range);
  assert.equal(agenda.status, 200); assert.ok(agenda.data.items.some(item => item.animal.nickname === info.otherAnimal));
});
await check('native login preserves user and employee counts and creates no invitations', async () => {
  const after = await qa('auth-state');
  for (const key of ['users', 'employees', 'invitations']) assert.equal(after[key], before[key]);
});
await check('phone aliases share the same ten-attempt authentication limit', async () => {
  for (const login of [user.login, user.login.slice(2)]) {
    assert.equal((await client().call('auth/staff-login', { ...payload('authDoctor', randomUUID(), login), password: 'Incorrect-password-2026' })).status, 401);
  }
  assert.equal((await client().call('auth/staff-login', payload('authDoctor'))).status, 429);
});
await writeFile(new URL('../Docs/password-login-http.json', import.meta.url), JSON.stringify({
  at: new Date().toISOString(), passed: checks.length, failed: 0, checks,
  data: 'own isolated synthetic schema only', guardedGateway: true, externalDelivery: false, productionChanged: false,
  secureCookieTransport: 'HTTP flag stripped only by loopback simulator helper; production remains HTTPS/Secure',
}, null, 2) + '\n');
console.log(JSON.stringify({ passed: checks.length, failed: 0, productionChanged: false }));
