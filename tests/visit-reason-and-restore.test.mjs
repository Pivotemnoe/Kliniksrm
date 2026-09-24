import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('лист осмотра использует анамнез; прежняя причина обращения сохраняется в истории и печати', async () => {
  const [exam, history, print] = await Promise.all([
    read('apps/web/src/features/visits/VisitExamTab.tsx'),
    read('apps/web/src/features/visits/VisitHistoryTab.tsx'),
    read('apps/web/src/features/visits/visitPrint.ts'),
  ]);
  assert.doesNotMatch(exam, /label="Причина обращения"/);
  assert.doesNotMatch(exam, /name="purpose"/);
  assert.match(exam, /anamnesis: nullToEmpty\(visit\.exam\?\.anamnesis\)/);
  assert.doesNotMatch(history, /label="Причина обращения"/);
  assert.match(history, /visit\.exam\?\.purpose, visit\.exam\?\.anamnesis/);
  assert.match(print, /visit\.exam\?\.purpose, visit\.exam\?\.anamnesis/);
});
