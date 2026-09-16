import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('подсказки исчезают по мере заполнения текущего черновика', async () => {
  const source = await read('apps/web/src/features/visits/VisitExamTab.tsx');
  const fragment = source.slice(source.indexOf('function buildVisitExamAssistantReview('), source.indexOf('function formatAttentionCount('));
  const compiled = ts.transpileModule(fragment, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const review = vm.runInNewContext(`${compiled}; buildVisitExamAssistantReview`);
  const empty = review({}, {});
  assert.equal(empty.issues.length, 7);
  const values = { purpose: 'Причина', anamnesis: 'Анамнез', examination: 'Осмотр', symptoms: 'Нет', manipulations: 'Не проводились', temperatureC: '38,5' };
  assert.equal(review(values, {}, { careNotes: 'Рекомендации' }).issues.length, 0);
  assert.equal(review({ ...values, temperatureC: '' }, {}, { careNotes: 'Рекомендации' }).issues[0].key, 'temperature');
  assert.equal(review(values, { recommendation: { careNotes: 'Сохранённое' } }, { careNotes: '' }).issues[0].key, 'recommendation');
});

test('помощник осмотра появляется после паузы, следит за текущими полями и не блокирует сохранение', async () => {
  const [exam, recommendation, card, styles] = await Promise.all([
    read('apps/web/src/features/visits/VisitExamTab.tsx'),
    read('apps/web/src/features/visits/VisitRecommendationTab.tsx'),
    read('apps/web/src/features/visits/VisitCardPage.tsx'),
    read('apps/web/src/styles.css'),
  ]);

  assert.match(exam, /Помощник проверил заполнение/);
  assert.match(exam, /}, 1400\)/);
  assert.match(exam, /Можно пропустить — сохранение осмотра доступно/);
  assert.match(exam, />\s*Скрыть\s*<\/Button>/);
  assert.match(exam, /Не показывать до конца приёма/);
  assert.match(exam, /Показать подсказки \(\{assistantReview\.issues\.length\}\)/);
  assert.match(exam, /Помощник ничего не исправляет и не сохраняет сам/);
  assert.match(exam, /Сохранить осмотр/);
  assert.doesNotMatch(exam, /disabled=\{disabled \|\| assistantReview/);
  assert.match(exam, /recommendationDraft \?\? visit\.recommendation/);
  assert.match(exam, /!hasText\(currentRecommendation\?\.careNotes\)/);
  assert.doesNotMatch(exam, /повторн\|контрол\|динамик/);
  assert.match(recommendation, /updateDraft\('careNotes', value\)/);
  assert.match(recommendation, /onDraftChange\?\.\(values\)/);
  assert.match(card, /recommendationDraft=\{recommendationDraft\?\.visitId === visit\.id/);
  assert.match(card, /onDraftChange=\{\(values\) => setRecommendationDraft/);
  assert.match(card, /onOpenRecommendations=\{\(\) => selectVisitTab\('recommendation'\)\}/);
  assert.match(styles, /\.visit-exam-assistant \{/);
  assert.match(styles, /@media \(max-width: 900px\)/);
});
