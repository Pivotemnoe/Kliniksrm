import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { MedicalPhrasesService } = require('../apps/api/dist/modules/medical-phrases/medical-phrases.service.js');
const { PracticeHintsService } = require('../apps/api/dist/modules/medical-phrases/practice-hints.service.js');

test('phrase learning counts distinct visits across retries and service restarts', async () => {
  const phrases = new Map();
  const receipts = new Set();
  const repo = {
    medicalPhrase: {
      upsert: async ({ where, create }) => {
        const key = JSON.stringify(where);
        if (!phrases.has(key)) phrases.set(key, { ...create, id: key });
        return phrases.get(key);
      },
      update: async ({ where, data }) => {
        const phrase = phrases.get(where.id);
        phrase.usageCount += data.usageCount.increment;
        phrase.learnedVisitCount += data.learnedVisitCount.increment;
      },
    },
    medicalPhraseLearning: { createMany: async ({ data }) => {
      const key = JSON.stringify(data[0]);
      if (receipts.has(key)) return { count: 0 };
      receipts.add(key); return { count: 1 };
    } },
  };
  const prisma = { $transaction: async fn => fn(repo) };
  const fields = { 'visit.exam.anamnesis': 'ТЕСТ проверка повторного сохранения текста' };
  const actor = { id: 'test-doctor', roles: ['doctor'] };
  await new MedicalPhrasesService(prisma, {}).learnFromText(fields, actor, 'visit-1');
  await new MedicalPhrasesService(prisma, {}).learnFromText(fields, actor, 'visit-1');
  assert.equal([...phrases.values()][0].learnedVisitCount, 1);
  await new MedicalPhrasesService(prisma, {}).learnFromText(fields, actor, 'visit-2');
  assert.equal([...phrases.values()][0].learnedVisitCount, 2);
  assert.equal([...phrases.values()][0].usageCount, 2);
});

test('failed historical query returns no advice and does not reject the clinical UI request', async () => {
  let calls = 0;
  const service = new PracticeHintsService({
    employee: { findUnique: async () => ({ medicalPhraseAssistantEnabled: true }) },
    visit: { findUnique: async () => ({ animalId: 'test-animal', animal: { species: 'Кошка' }, diagnoses: [{ title: 'ТЕСТ' }] }) },
    $transaction: async () => { calls++; throw Error('test timeout'); },
  });
  assert.deepEqual(await service.forVisit('test-visit', 'test-doctor'), []);
  assert.deepEqual(await service.forVisit('test-visit', 'test-doctor'), []);
  assert.equal(calls, 1);
});
