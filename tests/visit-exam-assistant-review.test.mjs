import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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
