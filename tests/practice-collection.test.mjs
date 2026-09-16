import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { PracticeCollectionService, normalizeDiagnosis } = require('../apps/api/dist/modules/medical-phrases/practice-collection.service.js');

function fixture(visits = [], locked = true) {
  const saved = [], removed = [], cursors = [], queries = [];
  const tx = {
    $queryRaw: async () => [{ locked }],
    practiceCollectionCursor: {
      upsert: async () => ({ lastVisitId: 'previous' }),
      update: async (q) => cursors.push(q.data.lastVisitId),
    },
    visit: { findMany: async (q) => { queries.push(q); return visits; } },
    practiceObservation: {
      upsert: async (q) => saved.push(q), deleteMany: async (q) => removed.push(q.where.visitId),
    },
  };
  const service = new PracticeCollectionService({ $transaction: async (fn) => fn(tx) });
  return { service, saved, removed, cursors, queries };
}
const visit = {
  id: 'v1', status: 'COMPLETED', animalId: 'a1', employeeId: 'e1',
  animal: { species: 'Кошка' }, diagnoses: [{ title: ' Отёк  лапы ' }],
  hospitalRecords: [], laboratoryOrders: [], recommendation: null,
};
test('collects one replaceable case, normalizes е/ё, not billing', async () => {
  const f = fixture([visit]);
  await f.service.tick(); await f.service.tick();
  assert.equal(f.saved.length, 2);
  assert.deepEqual(f.saved[0].where, f.saved[1].where);
  assert.deepEqual(f.saved[0].create.payload.diagnosisKeys, ['отек лапы']);
  assert.equal(f.saved[0].create.payload.complete, true);
  assert.equal(f.queries[0].take, 5);
  assert.equal(f.queries[0].select.bill, undefined);
  assert.equal(f.queries[0].select.hospitalRecords.where.cancelledAt, null);
  assert.deepEqual(f.queries[0].select.laboratoryOrders.where.status, { not: 'CANCELLED' });
});
test('removes cancelled or diagnosis-less cases from observations', async () => {
  const f = fixture([{ ...visit, status: 'CANCELLED' }, { ...visit, id: 'v2', diagnoses: [] }]);
  await f.service.tick();
  assert.deepEqual(f.removed, ['v1', 'v2']); assert.equal(f.saved.length, 0);
});
test('incomplete bounded snapshots are explicitly marked', async () => {
  const f = fixture([{ ...visit, hospitalRecords: Array(201).fill({ title: 'A' }) }]);
  await f.service.tick(); assert.equal(f.saved[0].create.payload.complete, false);
});
test('another worker lock prevents reads; end of scan resets cursor', async () => {
  const busy = fixture([visit], false); await busy.service.tick();
  assert.equal(busy.queries.length, 0);
  const empty = fixture(); await empty.service.tick(); assert.deepEqual(empty.cursors, ['']);
});
test('collector failure does not throw into clinical workflows and permits retry', async () => {
  let calls = 0;
  const service = new PracticeCollectionService({ $transaction: async () => { calls++; throw Error('offline'); } });
  await service.tick(); await service.tick(); assert.equal(calls, 2);
  assert.equal(normalizeDiagnosis('  ОТЁК   лапы '), 'отек лапы');
});
