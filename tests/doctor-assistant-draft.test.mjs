import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDoctorAssistantDraft, appendDoctorDraft } from '../apps/web/src/features/visits/doctorAssistantDraft.ts';
test('doctor draft preserves qualifiers and exact supplied treatment; missing facts are not invented', () => {
  const context = { nickname: 'QA cat', diagnoses: [{ title: 'Тестовое состояние', diagnosisType: 'Предварительный' }], treatmentPlan: 'Текст врача: 2 мл по указанной схеме' };
  const frozen = structuredClone(context); const result = buildDoctorAssistantDraft(context);
  assert.match(result.text, /Предварительный: Тестовое состояние/);
  assert.match(result.text, /Текст врача: 2 мл по указанной схеме/);
  assert.deepEqual(result.missing, ['Причина обращения', 'Осмотр']);
  assert.deepEqual(context, frozen);
  assert.notEqual(result.fingerprint, buildDoctorAssistantDraft({ ...context, treatmentPlan: 'Новый текст' }).fingerprint);
});
test('empty clinical data produces no inferred diagnosis, normal result or prescription', () => {
  const draft = buildDoctorAssistantDraft({ nickname: 'QA cat', diagnoses: [] });
  assert.equal(draft.text, 'Пациент: QA cat');
  assert.ok(draft.missing.includes('Назначения, указанные врачом'));
});
test('explicit acceptance appends without deleting existing notes and checks length', () => {
  assert.equal(appendDoctorDraft('Существующее', 'Черновик'), 'Существующее\n\nЧерновик');
  assert.throws(() => appendDoctorDraft('abc', 'def', 5), /длиннее/);
  assert.throws(() => appendDoctorDraft('abc', ' '), /пуст/);
});
