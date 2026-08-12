import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('причина обращения хранится отдельно от анамнеза и отображается в истории болезни', async () => {
  const [exam, history, apiService] = await Promise.all([
    read('apps/web/src/features/visits/VisitExamTab.tsx'),
    read('apps/web/src/features/visits/VisitHistoryTab.tsx'),
    read('apps/api/src/modules/visits/visits.service.ts'),
  ]);

  assert.match(exam, /label="Причина обращения"/);
  assert.match(exam, /purpose: nullToEmpty\(visit\.exam\?\.purpose\)/);
  assert.match(exam, /anamnesis: nullToEmpty\(visit\.exam\?\.anamnesis\)/);
  assert.doesNotMatch(exam, /purpose: ''/);
  assert.doesNotMatch(exam, /mergeText\(visit\.exam\?\.purpose/);
  assert.match(history, /label="Причина обращения"/);
  assert.match(apiService, /'visit\.exam\.purpose': dto\.purpose/);
});
