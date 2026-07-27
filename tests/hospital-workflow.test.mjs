import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('журнал стационара добавляется без изменения существующих клинических записей', async () => {
  const migration = await read('prisma/migrations/20260727000100_hospital_records/migration.sql');

  assert.match(migration, /CREATE TABLE "HospitalRecord"/);
  assert.match(migration, /REFERENCES "Visit"\("id"\)/);
  assert.doesNotMatch(migration, /^\s*(?:DROP\b|DELETE\s+FROM\b|TRUNCATE\b|UPDATE\s+[^\s]+\s+SET\b)/im);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Owner|Animal|Visit|VisitExam|Bill)"/);
});

test('стационар имеет отдельную карту и временной журнал', async () => {
  const routes = await read('apps/web/src/app/routes.tsx');
  const card = await read('apps/web/src/features/hospital/HospitalCardPage.tsx');
  const hospitalList = await read('apps/web/src/features/hospital/HospitalPage.tsx');

  assert.match(routes, /path: '\/hospital\/:visitId'/);
  assert.match(card, /Журнал стационара/);
  assert.match(card, /Температура, препараты, процедуры, наблюдения, кормление и уход/);
  assert.match(hospitalList, /label: animal\.nickname/);
  assert.doesNotMatch(hospitalList, /label: `\$\{animal\.nickname\} · \$\{owner\.fullName\}`/);
});

test('обычные приёмы и стационар разделены в пользовательском интерфейсе', async () => {
  const visitsPage = await read('apps/web/src/features/visits/VisitsPage.tsx');
  const visitCard = await read('apps/web/src/features/visits/VisitCardPage.tsx');
  const exam = await read('apps/web/src/features/visits/VisitExamTab.tsx');

  assert.match(visitsPage, /excludeHospital: true/);
  assert.match(visitCard, /Открыть карту стационара/);
  assert.doesNotMatch(visitCard, /<VisitHospitalTab/);
  assert.match(exam, /value="Стационар"/);
});
