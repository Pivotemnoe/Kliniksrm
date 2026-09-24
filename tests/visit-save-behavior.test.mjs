import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { VisitsService } = require('../apps/api/dist/modules/visits/visits.service.js');
const actor = { id: 'test-doctor', roles: ['doctor'] };

// In-memory repository: exercises the actual service, without clinical DB access.
function fixture(options = {}) {
  const state = {
    visit: { id: 'test-visit', animalId: 'test-animal', ownerId: 'test-owner',
      status: 'IN_PROGRESS', visitType: 'PRIMARY', ...options.visit },
    exam: null, recommendation: null, weights: [], audit: [], learned: [], sync: [],
    diagnoses: options.diagnoses ?? [{ diagnosisType: 'Предварительный' }],
  };
  const upsert = (key) => async ({ create, update }) => {
    state[key] = state[key] ? { ...state[key], ...update } : { ...create };
    return { ...state[key] };
  };
  const repo = {
    visit: { findUnique: async () => state.visit },
    visitDiagnosis: { findMany: async () => state.diagnoses },
    visitExam: { upsert: upsert('exam'), findUnique: async () => state.exam },
    $queryRaw: async () => [{ id: 'test-visit' }],
    visitRecommendation: { upsert: upsert('recommendation') },
    animalWeightRecord: { create: async ({ data }) => state.weights.push(data) },
  };
  const service = new VisitsService(
    { ...repo, $transaction: async (fn) => fn(repo) },
    { log: async (entry) => state.audit.push(entry) }, {}, {},
    { learnFromText: async (fields) => {
      if (options.learningFails) throw new Error('phrase store unavailable');
      state.learned.push(fields);
    } },
    { enqueue: async (entry) => state.sync.push(entry), syncNow: async () => {} },
  );
  return { state, service };
}

test('exam survives partial update and intentional text clearing; saving does not complete visit', async () => {
  const { state, service } = fixture();
  await service.upsertExam('test-visit', { purpose: 'ТЕСТ', anamnesis: 'Тестовый анамнез', examination: 'Тестовый осмотр' }, actor);
  const result = await service.upsertExam('test-visit', { examination: 'Уточнение', anamnesis: '' }, actor);
  assert.equal(result.purpose, 'ТЕСТ');
  assert.equal(result.anamnesis, '');
  assert.equal(result.examination, 'Уточнение');
  assert.equal(state.visit.status, 'IN_PROGRESS');
  assert.equal(state.sync.length, 0);
  assert.equal(state.audit.length, 2);
  assert.equal(state.audit[1].actorId, actor.id);
  assert.deepEqual(state.audit[1].metadata.changedFields, ['examination', 'anamnesis']);
});

test('recommendation partial update retains treatment plan and does not overwrite exam', async () => {
  const { state, service } = fixture();
  await service.upsertExam('test-visit', { examination: 'Сохранённый осмотр' }, actor);
  await service.upsertRecommendation('test-visit', { treatmentPlan: 'Тестовый план', careNotes: 'Тестовая памятка' }, actor);
  await service.upsertRecommendation('test-visit', { careNotes: '' }, actor);
  assert.equal(state.recommendation.treatmentPlan, 'Тестовый план');
  assert.equal(state.recommendation.careNotes, '');
  assert.equal(state.exam.examination, 'Сохранённый осмотр');
});

test('primary exam autosaves without diagnosis while visit stays in progress', async () => {
  const { state, service } = fixture({ diagnoses: [] });
  await service.upsertExam('test-visit', { purpose: 'ТЕСТ' }, actor);
  assert.equal(state.exam.purpose, 'ТЕСТ');
  assert.equal(state.visit.status, 'IN_PROGRESS');
});

test('doctor cannot edit old completed visit; director amendment is audited and synchronized', async () => {
  const { state, service } = fixture({ visit: { status: 'COMPLETED', completedAt: new Date('2026-01-01') } });
  await assert.rejects(service.upsertExam('test-visit', { comment: 'ТЕСТ' }, actor), /60 минут/);
  assert.equal(state.exam, null);
  await service.upsertExam('test-visit', { comment: 'ТЕСТ' }, { id: 'test-director', roles: ['director'] });
  assert.equal(state.audit[0].actorId, 'test-director');
  assert.equal(state.sync[0].visitId, 'test-visit');
  assert.equal(state.visit.status, 'COMPLETED');
});

test('retry without weight does not create an unrelated weight measurement', async () => {
  const { state, service } = fixture();
  await service.upsertExam('test-visit', { weightKg: 4.8, comment: 'ТЕСТ' }, actor);
  await service.upsertExam('test-visit', { comment: 'ТЕСТ уточнение' }, actor);
  assert.equal(state.weights.length, 1);
  assert.equal(state.exam.weightKg, 4.8);
});

test('unchanged weight in repeated autosave must not add a new measurement',
  async () => {
    const { state, service } = fixture();
    await service.upsertExam('test-visit', { weightKg: 4.8, comment: 'ТЕСТ' }, actor);
    await service.upsertExam('test-visit', { weightKg: 4.8, comment: 'ТЕСТ уточнение' }, actor);
    assert.equal(state.weights.length, 1);
  });

test('optional phrase learning failure must not report an already committed exam as failed',
  async () => {
    const { state, service } = fixture({ learningFails: true });
    await assert.doesNotReject(service.upsertExam('test-visit', { examination: 'ТЕСТ' }, actor));
    assert.equal(state.exam.examination, 'ТЕСТ');
  });

test('changed weight records a new measurement; same weight in a new visit is still measured', async () => {
  const { state, service } = fixture();
  await service.upsertExam('test-visit', { weightKg: 4.8 }, actor);
  await service.upsertExam('test-visit', { weightKg: 4.9 }, actor);
  assert.equal(state.weights.length, 2);
  state.exam = null;
  await service.upsertExam('another-visit', { weightKg: 4.9 }, actor);
  assert.equal(state.weights.length, 3);
});
test('recommendation survives optional phrase learning outage', async () => {
  const { state, service } = fixture({ learningFails: true });
  await service.upsertRecommendation('test-visit', { careNotes: 'ТЕСТ памятка' }, actor);
  assert.equal(state.recommendation.careNotes, 'ТЕСТ памятка');
});

test('completion and direct status update both reject a primary visit without examination text', async () => {
 const { service } = fixture();
 await assert.rejects(service.completeVisit('test-visit', actor), /Заполните текст осмотра/);
 await assert.rejects(service.updateVisit('test-visit', { status: 'COMPLETED' }, actor), /Заполните текст осмотра/);
});
test('completion and direct status update both reject a primary visit without diagnosis', async () => {
 const { service } = fixture({ diagnoses: [] });
 await assert.rejects(service.completeVisit('test-visit', actor), /ни одного диагноза/);
 await assert.rejects(service.updateVisit('test-visit', { status: 'COMPLETED' }, actor), /ни одного диагноза/);
});
