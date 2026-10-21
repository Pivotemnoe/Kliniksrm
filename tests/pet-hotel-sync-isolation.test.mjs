import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
const ts = projectRequire('typescript');
const sourcePath = path.resolve(process.argv[2] || 'apps/api/src/modules/pet-hotel/pet-hotel-sync.service.ts');
const ownerSourcePath = path.resolve(process.argv[3] || 'apps/api/src/modules/pet-hotel/pet-hotel-portal.service.ts');

class HttpException extends Error {
  constructor(message, status) { super(message); this.status = status; }
  getStatus() { return this.status; }
}
const common = { HttpException, Injectable: () => value => value, Logger: class { warn() {} } };
for (const [name, code] of Object.entries({ BadRequestException: 400, ConflictException: 409, ForbiddenException: 403, ServiceUnavailableException: 503 })) {
  common[name] = class extends HttpException { constructor(message) { super(message, code); } };
}
function load(source, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports, Buffer, process: { env: {} },
    require(name) {
      if (name === '@nestjs/common') return common;
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === 'node:crypto') return require(name);
      throw Error('Unexpected dependency: ' + name);
    },
    fetch() { throw Error('Real network is forbidden in these checks'); },
    setInterval() { throw Error('Real timer is forbidden in these checks'); },
    clearInterval() {}, AbortSignal,
  };
  vm.runInNewContext(compiled.outputText, sandbox, { filename: source });
  return module.exports;
}
const { PetHotelSyncService } = load(sourcePath);
function fixture({ failingPath, executeError, dispatchError, operations, registrations, snapshotError, registerError } = {}) {
  const events = [], warnings = [], posts = [];
  const items = operations || [{ id: 'operation-one', ownerId: 'owner', kind: 'STATE', input: {}, expiresAt: '2099-01-01T00:00:00Z' }];
  const owner = {
    async storefrontSnapshot() { events.push('snapshot'); if (snapshotError) throw snapshotError; return { schemaVersion: 1 }; },
    async register() { events.push('register'); if (registerError) throw registerError; return { ownerId: 'owner' }; },
    async execute(item) { events.push('execute:' + item.id); if (executeError) throw executeError; return { accepted: item.id }; },
  };
  const live = { publish() { events.push('live'); } };
  const service = new PetHotelSyncService({}, owner, live);
  service.logger = { warn(message) { warnings.push(message); } };
  service.gateway = async (route, body) => {
    events.push(route); if (body) posts.push({ route, body });
    if (route === failingPath) throw Error('Synthetic transport failure with private details');
    if (route === '/registrations') return { items: registrations || [] };
    if (route === '/operations') return { items };
    return { ok: true };
  };
  service.dispatch = async () => { events.push('dispatch'); if (dispatchError) throw dispatchError; };
  return { service, owner, events, warnings, posts };
}

test('successful stages remain sequential and retain request/result order', async () => {
  const f = fixture({ registrations: [{ id: 'registration-one', maxUserId: '100', input: {} }] });
  await f.service.syncNow();
  assert.deepEqual(f.events, ['snapshot', '/storefront', '/registrations', 'register', '/registrations/registration-one/result', '/operations', 'execute:operation-one', '/operations/operation-one/result', 'dispatch']);
  assert.equal(f.warnings.length, 0);
  assert.equal(f.service.running, false);
});

test('storefront HTTP failure does not starve registrations, operations or dispatch', async () => {
  const f = fixture({ failingPath: '/storefront' });
  await f.service.syncNow();
  assert(f.events.includes('/registrations'));
  assert(f.events.includes('execute:operation-one'));
  assert.equal(f.events.at(-1), 'dispatch');
  assert.equal(f.service.storefrontPublishedAt, 0);
  assert.equal(f.warnings.length, 1);
  assert(!f.warnings[0].includes('private details'));
});

test('local snapshot failure still permits inbound commands and due notification dispatch', async () => {
  const f = fixture({ snapshotError: Error('snapshot unavailable') });
  await f.service.syncNow();
  assert(!f.events.includes('/storefront'));
  assert(f.events.includes('/registrations'));
  assert(f.events.includes('execute:operation-one'));
  assert.equal(f.events.at(-1), 'dispatch');
  assert.equal(f.service.storefrontPublishedAt, 0);
});

test('registration transport failure does not starve operations or dispatch', async () => {
  const f = fixture({ failingPath: '/registrations' });
  await f.service.syncNow();
  assert(f.events.includes('execute:operation-one'));
  assert.equal(f.events.at(-1), 'dispatch');
  assert.equal(f.warnings.length, 1);
});

test('a registration result failure leaves operations and dispatch progressing', async () => {
  const f = fixture({ registrations: [{ id: 'registration-one', maxUserId: '100', input: {} }], failingPath: '/registrations/registration-one/result' });
  await f.service.syncNow();
  assert(f.events.includes('register'));
  assert(f.events.includes('execute:operation-one'));
  assert.equal(f.events.at(-1), 'dispatch');
});

test('operation polling failure still permits due notification dispatch', async () => {
  const f = fixture({ failingPath: '/operations' });
  await f.service.syncNow();
  assert(!f.events.includes('execute:operation-one'));
  assert.equal(f.events.at(-1), 'dispatch');
  assert.equal(f.service.running, false);
});

test('unexpected or retryable execution failure is not acknowledged but does not block dispatch', async () => {
  for (const error of [Error('temporary DB failure'), new HttpException('retry later', 429), new HttpException('temporary server failure', 503)]) {
    const f = fixture({ executeError: error });
    await f.service.syncNow();
    assert(f.events.includes('execute:operation-one'));
    assert(!f.posts.some(p => p.route === '/operations/operation-one/result'));
    assert.equal(f.events.at(-1), 'dispatch');
  }
});

test('non-retryable command validation still receives the existing FAILED response', async () => {
  const f = fixture({ executeError: new HttpException('invalid selection', 409) });
  await f.service.syncNow();
  const ack = f.posts.find(p => p.route === '/operations/operation-one/result');
  assert.equal(ack.body.status, 'FAILED');
  assert.equal(ack.body.error, 'invalid selection');
  assert.equal(f.events.at(-1), 'dispatch');
});

test('lost result POST after a real owner-service receipt is recovered without a second mutation', async () => {
  const dto = Object.fromEntries(['HotelOwnerBookDto', 'HotelOwnerCancelDto', 'HotelOwnerMoveDto', 'HotelOwnerOptionsDto', 'HotelOwnerPetDto'].map(name => [name, class {}]));
  const { PetHotelOwnerService } = load(ownerSourcePath, {
    'class-transformer': { plainToInstance: (Type, value) => Object.assign(new Type(), value) },
    'class-validator': { validate: async () => [] },
    '../../common/phone': { normalizePhoneForLookup: value => value },
    './pet-hotel.service': { lockPetHotel: async () => {} },
    './pet-hotel-portal.dto': dto,
  });
  const receipts = new Map(); let petCreates = 0, jobs = 0, audits = 0;
  const tx = {
    owner: { findUnique: async () => ({ id: 'owner', fullName: 'Test owner', portalAccess: { status: 'ENABLED' } }) },
    petHotelCommandReceipt: {
      findUnique: async ({ where }) => receipts.get(where.id),
      create: async ({ data }) => { assert(!receipts.has(data.id)); receipts.set(data.id, data); return data; },
    },
    animal: { create: async () => { ++petCreates; return { id: 'one-pet', nickname: 'Test pet', species: 'Кошка', breed: null }; } },
    backgroundJob: { create: async () => { ++jobs; } },
  };
  const actualOwner = new PetHotelOwnerService({ $transaction: async callback => callback(tx) }, { context: async () => ({ installation: { id: 'installation' }, settings: { selfBookingEnabled: true }, limited: false }) }, { log: async () => { ++audits; } });
  const item = { id: 'operation-one', ownerId: 'owner', kind: 'PET_CREATE', input: { nickname: 'Test pet', species: 'CAT' }, expiresAt: '2099-01-01T00:00:00Z' };
  const f = fixture({ operations: [item] });
  f.service.owner = actualOwner;
  const gateway = f.service.gateway; let loseFirstAck = true;
  f.service.gateway = async (route, body) => {
    if (route === '/operations/operation-one/result' && loseFirstAck) { loseFirstAck = false; throw Error('Response lost after committed command'); }
    return gateway(route, body);
  };
  await f.service.syncNow();
  assert.equal(petCreates, 1); assert.equal(receipts.size, 1); assert.equal(jobs, 1); assert.equal(audits, 1);
  assert.equal(f.events.filter(e => e === 'dispatch').length, 1);
  assert(!f.events.includes('live'));
  const storedReceipt = receipts.get('pet-hotel:portal:operation-one');
  await f.service.syncNow();
  assert.equal(petCreates, 1); assert.equal(jobs, 1); assert.equal(audits, 1); assert.equal(receipts.size, 1);
  assert.strictEqual(receipts.get('pet-hotel:portal:operation-one'), storedReceipt);
  assert.equal(f.events.filter(e => e === 'dispatch').length, 2);
  assert.equal(f.events.filter(e => e === 'live').length, 1);
  const ack = f.posts.find(p => p.route === '/operations/operation-one/result');
  assert.equal(ack.body.status, 'DONE'); assert.equal(ack.body.result.id, 'one-pet');
});

test('dispatch failure releases the guard so the next complete cycle can run', async () => {
  const f = fixture({ dispatchError: Error('notification DB unavailable') });
  await f.service.syncNow();
  assert.equal(f.service.running, false);
  assert.equal(f.warnings.length, 1);
  await f.service.syncNow();
  assert.equal(f.events.filter(e => e === '/operations').length, 2);
  assert.equal(f.service.running, false);
});

test('overlapping ticks do not create concurrent stage work', async () => {
  const f = fixture(); const gateway = f.service.gateway;
  let unblock, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { unblock = resolve; });
  f.service.gateway = async (route, body) => { if (route === '/registrations') { entered(); await waiting; } return gateway(route, body); };
  const first = f.service.syncNow(); await started;
  await f.service.syncNow();
  assert(!f.events.includes('/operations'));
  unblock(); await first;
  assert.equal(f.events.filter(e => e === '/operations').length, 1);
  assert.equal(f.events.filter(e => e === 'snapshot').length, 1);
  assert.equal(f.service.running, false);
});

test('successful storefront throttling is retained while failed publication is retried', async () => {
  const success = fixture(); await success.service.syncNow(); await success.service.syncNow();
  assert.equal(success.events.filter(e => e === '/storefront').length, 1);
  assert.equal(success.events.filter(e => e === '/operations').length, 2);
  const failure = fixture({ failingPath: '/storefront' }); await failure.service.syncNow(); await failure.service.syncNow();
  assert.equal(failure.events.filter(e => e === '/storefront').length, 2);
  assert.equal(failure.events.filter(e => e === 'dispatch').length, 2);
});
