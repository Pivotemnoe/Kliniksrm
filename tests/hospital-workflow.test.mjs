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

  assert.match(routes, /path: '\/hospital\/:stayId'/);
  assert.match(card, /Журнал стационара/);
  assert.match(card, /Температура, препараты, процедуры, наблюдения, кормление и уход/);
  assert.match(hospitalList, /label: animal\.nickname/);
  assert.doesNotMatch(hospitalList, /label: `\$\{animal\.nickname\} · \$\{owner\.fullName\}`/);
});

test('обычные приёмы и стационар разделены в пользовательском интерфейсе', async () => {
  const visitsPage = await read('apps/web/src/features/visits/VisitsPage.tsx');
  const visitCard = await read('apps/web/src/features/visits/VisitCardPage.tsx');
  const exam = await read('apps/web/src/features/visits/VisitExamTab.tsx');

  assert.doesNotMatch(visitsPage, /excludeHospital: true/);
  assert.match(visitCard, /Открыть карту стационара/);
  assert.match(visitCard, /hospitalStay/);
  assert.doesNotMatch(visitCard, /<VisitHospitalTab/);
  assert.match(exam, /value="Стационар"/);
});

test('пребывание в стационаре имеет независимый от приёма жизненный цикл', async () => {
  const migration = await read('prisma/migrations/20260728000100_hospital_stay_lifecycle/migration.sql');
  const service = await read('apps/api/src/modules/hospital/hospital.service.ts');

  assert.match(migration, /CREATE TABLE "HospitalStay"/);
  assert.match(migration, /"sourceVisitId" TEXT NOT NULL/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.match(service, /data: \{ status: VisitStatus\.COMPLETED, completedAt \}/);
  assert.match(service, /tx\.hospitalStay\.create/);
  assert.match(service, /status: HospitalStayStatus\.ACTIVE/);
  assert.match(service, /data: \{ status: HospitalStayStatus\.DISCHARGED, completedAt: new Date\(\) \}/);
  assert.doesNotMatch(service, /data: \{ status: VisitStatus\.COMPLETED, completedAt: new Date\(\) \}/);
});

test('поиск стационара работает без обязательного фильтра статуса', async () => {
  const service = await read('apps/api/src/modules/hospital/hospital.service.ts');
  const page = await read('apps/web/src/features/hospital/HospitalPage.tsx');

  assert.match(service, /\.\.\.\(query\.status \? \{ status: query\.status \} : \{\}\)/);
  assert.doesNotMatch(service, /query\.status \? \[query\.status\]/);
  assert.match(page, /value=\{status\}/);
  assert.match(page, /placeholder="Все статусы"/);
});

test('температура стационара передаётся числом с точностью до десятых', async () => {
  const dto = await read('apps/api/src/modules/hospital/dto/create-hospital-record.dto.ts');
  const card = await read('apps/web/src/features/hospital/HospitalCardPage.tsx');

  assert.match(dto, /@Type\(\(\) => Number\)/);
  assert.match(dto, /maxDecimalPlaces: 1/);
  assert.match(card, /Math\.round\(Number\(String\(values\.temperatureC\)\.replace\(',', '\.'\)\) \* 10\) \/ 10/);
});

test('запись стационара редактируется и может быть связана со счётом и складом', async () => {
  const [schema, migration, controller, service, card, api] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260730000300_hospital_record_billing/migration.sql'),
    read('apps/api/src/modules/hospital/hospital.controller.ts'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/hospital/hospital.api.ts'),
  ]);

  assert.match(schema, /billItemId\s+String\?\s+@unique/);
  assert.match(migration, /REFERENCES "BillItem"\("id"\) ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.match(controller, /@Patch\(':stayId\/records\/:recordId'\)/);
  assert.match(service, /hospital\.record\.update/);
  assert.match(service, /StockMovementType\.VISIT_USAGE/);
  assert.match(service, /recalculateHospitalBill/);
  assert.match(card, /Изменить/);
  assert.match(card, /Товар — начислить и списать со склада/);
  assert.match(card, /Услуга — начислить по прайсу/);
  assert.match(api, /updateHospitalRecord/);
});
