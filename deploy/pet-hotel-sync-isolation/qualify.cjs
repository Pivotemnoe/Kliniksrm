const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const manifest = require('/tmp/hotel-sync-release.json');
const { PetHotelSyncService } = require('/app/apps/api/dist/modules/pet-hotel/pet-hotel-sync.service.js');
(async () => {
  for (const file of manifest.compiled) {
    const bytes = fs.readFileSync('/app/apps/api/dist/modules/pet-hotel/' + file.name);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  const seen = [];
  const service = new PetHotelSyncService({}, {
    storefrontSnapshot: async () => ({}),
    execute: async () => { seen.push('execute'); return { synthetic: true }; },
  }, { publish: () => assert.fail('STATE must not emit a mutation') });
  service.logger = { warn: () => {} };
  service.gateway = async path => {
    if (path === '/storefront') throw Error('Synthetic offline storefront');
    if (path === '/registrations') return { items: [] };
    if (path === '/operations') return { items: [{ id: 'synthetic', kind: 'STATE', input: {} }] };
    seen.push('result'); return { ok: true };
  };
  service.dispatch = async () => { seen.push('dispatch'); };
  await service.syncNow();
  assert.deepEqual(seen, ['execute', 'result', 'dispatch']);
  assert.equal(service.running, false);
  assert.equal(service.storefrontPublishedAt, 0);
  console.log(JSON.stringify({ passed: true, compiledHashesVerified: manifest.compiled.length, externalNetwork: false, databaseAccess: false }));
})().catch(error => { console.error(error.name); process.exitCode = 1; });
