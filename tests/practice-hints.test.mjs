import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { buildPracticeHints, PracticeHintsService } = require('../apps/api/dist/modules/medical-phrases/practice-hints.service.js');
const makeCase = (animalId) => ({ animalId, diagnoses: [{ title: 'Отёк' }],
  hospitalRecords: [{ title: 'Процедура А', plannedProductId: null, plannedServiceId: 's1' }], laboratoryOrders: [] });

test('clinic history ranks nominations only after three distinct animals', () => {
  const cases = ['1', '2', '3'].map(makeCase);
  assert.deepEqual(buildPracticeHints(cases, ['отек']), [{ diagnosis: 'отек', titles: ['Процедура А'] }]);
  assert.deepEqual(buildPracticeHints(cases.slice(0, 2), ['отек']), []);
  assert.deepEqual(buildPracticeHints([makeCase('1'), makeCase('1'), makeCase('1')], ['отек']), []);
});
test('different or ambiguous diagnoses and partial cases never recommend', () => {
  const cases = ['1', '2', '3'].map(makeCase);
  assert.deepEqual(buildPracticeHints(cases, ['Другой диагноз']), []);
  assert.deepEqual(buildPracticeHints(cases.map((v) => ({ ...v, diagnoses: [...v.diagnoses, { title: 'Другой' }] })), ['Отёк']), []);
  assert.deepEqual(buildPracticeHints(cases.map((v) => ({ ...v, hospitalRecords: Array(101).fill(v.hospitalRecords[0]) })), ['Отёк']), []);
});
test('unlinked free-text records are not generated treatment advice', () => {
  const cases = ['1', '2', '3'].map(makeCase).map((v) => ({ ...v,
    hospitalRecords: [{ title: 'Текст врача', plannedProductId: null, plannedServiceId: null }] }));
  assert.deepEqual(buildPracticeHints(cases, ['Отёк']), []);
});
test('history lookup excludes current animal, cancelled visits, bills and cancelled records; cached', async () => {
  let query, calls = 0;
  const prisma = {
    employee: { findUnique: async () => ({ medicalPhraseAssistantEnabled: true }) },
    visit: { findUnique: async () => ({ animalId: 'current', animal: { species: 'Кошка' }, diagnoses: [{ title: 'Отёк' }] }) },
    $transaction: async (fn) => { calls++; return fn({ $executeRaw: async () => {}, visit: { findMany: async (q) => { query = q; return ['1', '2', '3'].map(makeCase); } } }); },
  };
  const service = new PracticeHintsService(prisma);
  assert.equal((await service.forVisit('v', 'e')).length, 1);
  await service.forVisit('v', 'e'); assert.equal(calls, 1);
  assert.equal(query.take, 60);
  assert.equal(query.where.status, 'COMPLETED');
  assert.equal(query.where.animalId.not, 'current');
  assert.equal(query.where.animal.species.equals, 'Кошка');
  assert.equal(query.select.bill, undefined);
  assert.equal(query.select.hospitalRecords.where.cancelledAt, null);
  assert.equal(query.select.hospitalRecords.where.createdAsPlan, true);
});
test('disabled personal assistant does not read patient or historical data', async () => {
  const service = new PracticeHintsService({ employee: { findUnique: async () => ({ medicalPhraseAssistantEnabled: false }) } });
  assert.deepEqual(await service.forVisit('v', 'e'), []);
});
