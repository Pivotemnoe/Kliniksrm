import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const integration = '/Users/konstantin/.codex/worktrees/grooming-integration/CRM';
const fixture = JSON.parse(await readFile(resolve(integration, '.artifacts/grooming-integration/ui-preview-private.json'), 'utf8'));
const records = [];
async function request(port, path, { body, cookie, method } = {}) {
  assert.ok([4281, 4282, 4283].includes(port), 'Only the local style QA servers are allowed');
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), 'x-temichevvet-client-id': 'module-style-local-qa' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
function check(label, actual, expected) { assert.deepEqual(actual, expected, label); records.push({ label, passed: true }); }
async function login(port, name) { const r = await request(port, '/api/auth/login', { body: { login: fixture[name], password: fixture.password } }); check(`Local ${name} login`, r.status, 200); assert.ok(r.cookie); return r.cookie; }

const director = await login(4281, 'director');
const groomer = await login(4283, 'groomer');
const other = await login(4283, 'otherGroomer');
const booking = await request(4281, `/api/v1/grooming/bookings/${fixture.bookingId}`, { cookie: director });
check('Existing synthetic reservation opens', booking.status, 200);
check('Assigned groomer can open reservation', (await request(4283, `/api/v1/grooming/bookings/${fixture.bookingId}`, { cookie: groomer })).status, 200);
check('Other groomer cannot open that reservation', (await request(4283, `/api/v1/grooming/bookings/${fixture.bookingId}`, { cookie: other })).status, 404);
const overview = await request(4283, '/api/v1/grooming/overview', { cookie: groomer });
check('Groomer has only their specialist scope', overview.data.specialists.length, 1);
check('Groomer cannot manage module settings', overview.data.canManage, false);
check('Groomer cannot create services', (await request(4283, '/api/v1/grooming/services', { cookie: groomer, body: { title: 'Forbidden QA service', price: 1 } })).status, 403);
const inbox = await request(4283, '/api/v1/grooming/staff/inbox', { cookie: groomer });
check('Personal inbox is available', inbox.status, 200);
check('Push is disabled on the local grooming QA server', (await request(4283, '/api/v1/grooming/staff/push/config', { cookie: groomer })).data.available, false);
const avito = await request(4282, '/api/v1/avito');
check('Current Avito schema and overview are compatible', avito.status, 200);
check('Avito external sending stays disabled', avito.data.runtime.liveSendEnabled, false);
check('Doctor cannot read the Avito module', (await request(4282, '/api/v1/avito', { cookie: 'crm_style_avito_avito_qa_role=doctor' })).status, 403);
check('Administrator cannot access ad editor', (await request(4282, '/api/v1/avito/editor/catalog', { cookie: 'crm_style_avito_avito_qa_role=administrator' })).status, 403);

if (process.argv.includes('--seed-notice')) {
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require('@prisma/client');
  assert.ok(booking.data.animal.nickname.includes('тест'));
  const db = new PrismaClient({ datasources: { db: { url: 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/grooming_crm_integration_preview' } } });
  try {
    const actor = (await request(4283, '/api/auth/me', { cookie: groomer })).data.employee;
    await db.groomingStaffNotice.create({ data: { employeeId: actor.id, event: 'TEST', dedupeKey: `module-style-${randomUUID()}`, title: 'Проверка оповещений', body: 'Локальное тестовое событие. Проверяем просмотр без изменения записи питомца.', href: '/grooming/notifications', expiresAt: new Date(Date.now() + 86400000) } });
    await writeFile(resolve(root, '.artifacts/read-all-before.json'), JSON.stringify({ id: booking.data.id, version: booking.data.version, status: booking.data.status }));
    records.push({ label: 'Synthetic TEST event prepared without push delivery', passed: true });
  } finally { await db.$disconnect(); }
}
if (process.argv.includes('--verify-read')) {
  const before = JSON.parse(await readFile(resolve(root, '.artifacts/read-all-before.json'), 'utf8'));
  check('Viewing notices preserves reservation status and version', { id: booking.data.id, version: booking.data.version, status: booking.data.status }, before);
  check('Read-all clears personal unread count', inbox.data.unread, 0);
}

if (process.argv.includes('--prepare-owner')) {
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require(resolve(integration, 'apps/owner-gateway/dist/generated/client/index.js'));
  const url = 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/grooming_portal_integration_preview';
  assert.equal(new URL(url).pathname, '/grooming_portal_integration_preview');
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const ownerId = booking.data.ownerId;
    await db.ownerSnapshot.findUniqueOrThrow({ where: { ownerId } });
    const token = randomUUID() + randomUUID();
    await db.portalSession.create({ data: { ownerId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });
    await mkdir(resolve(root, '.artifacts'), { recursive: true });
    await writeFile(resolve(root, '.artifacts/style-owner-session.json'), JSON.stringify({ mode: 'SYNTHETIC_MODULE_STYLE', cookieName: 'grooming_integration_owner', token }), { mode: 0o600 });
    records.push({ label: 'Synthetic owner session prepared without production credentials', passed: true });
  } finally { await db.$disconnect(); }
}
const output = '/Users/konstantin/Documents/CRM/output/design/module-style-20261020';
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'local-api-checks.json'), JSON.stringify({ at: new Date().toISOString(), productionChanged: false, records, booking: { id: booking.data.id, version: booking.data.version, status: booking.data.status }, inbox: { unread: inbox.data.unread, events: [...new Set(inbox.data.items.map(item => item.event))] } }, null, 2));
console.log(JSON.stringify({ passed: records.length, productionChanged: false, externalSending: false }));
