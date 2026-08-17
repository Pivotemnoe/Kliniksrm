import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('назначивший, исполнитель и отменивший сохраняются раздельно', async () => {
  const [schema, migration, service, sheet] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260816000100_hospital_execution_and_vaccination_queue/migration.sql'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/web/src/features/hospital/HospitalSheet.tsx'),
  ]);

  assert.match(schema, /performedById\s+String\?/);
  assert.match(schema, /cancelledById\s+String\?/);
  assert.match(migration, /ADD COLUMN "performedById" TEXT/);
  assert.doesNotMatch(migration, /^\s*(?:DROP\b|DELETE\s+FROM\b|TRUNCATE\b|UPDATE\s+)/im);
  assert.match(service, /performedById: actorId/);
  assert.match(service, /cancelledById: actorId/);
  assert.match(sheet, /Назначил:/);
  assert.match(sheet, /Исполнитель:/);
  assert.match(sheet, /Отменил:/);
});

test('отмена имеет отдельное время и может охватывать будущую серию', async () => {
  const [service, controller, sheet] = await Promise.all([
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/api/src/modules/hospital/hospital.controller.ts'),
    read('apps/web/src/features/hospital/HospitalSheet.tsx'),
  ]);

  assert.match(controller, /records\/:recordId\/cancel/);
  assert.match(service, /THIS_AND_FUTURE/);
  assert.match(service, /recordedAt: \{ gte: target\.recordedAt \}/);
  assert.match(service, /cancelledAt/);
  assert.match(sheet, /отменено \{formatTime\(record\.cancelledAt/);
  assert.doesNotMatch(sheet, /Не выполнено/);
});

test('тип назначения управляет каталогом и полями', async () => {
  const [modal, service] = await Promise.all([
    read('apps/web/src/features/hospital/HospitalTreatmentPlanModal.tsx'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
  ]);

  assert.match(modal, /MEDICATION: \{ catalog: 'PRODUCT'/);
  assert.match(modal, /PROCEDURE: \{ catalog: 'SERVICE'/);
  assert.match(modal, /FEEDING: \{ catalog: 'NONE', defaultTitle: 'Кормление'/);
  assert.match(modal, /TEMPERATURE: \{ catalog: 'NONE', defaultTitle: 'Измерение температуры'/);
  assert.match(modal, /Выберите препарат из реестра/);
  const hospitalCatalogBlock = service.slice(service.indexOf('async getCatalog'), service.indexOf('async getHospitalStay'));
  assert.doesNotMatch(hospitalCatalogBlock, /take:\s*100/);
});

test('вакцинация из очереди не создаёт обычный приём', async () => {
  const [schema, queueForm, queuePage, visitService, animalCard] = await Promise.all([
    read('prisma/schema.prisma'),
    read('apps/web/src/features/queue/QueueFormDrawer.tsx'),
    read('apps/web/src/features/queue/QueuePage.tsx'),
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('apps/web/src/features/animals/AnimalCardPage.tsx'),
  ]);

  assert.match(schema, /isVaccination\s+Boolean\s+@default\(false\)/);
  assert.match(queueForm, /'VACCINATION'/);
  assert.match(queuePage, /tab=vaccinations&new=vaccination/);
  assert.match(visitService, /обычный приём создавать не нужно/);
  assert.match(animalCard, /autoOpen=\{searchParams\.get\('new'\) === 'vaccination'\}/);
});

test('перевод в стационар сохраняет и открывает исходный приём', async () => {
  const [service, hospitalCard, visitCard] = await Promise.all([
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/visits/VisitCardPage.tsx'),
  ]);
  const admitExisting = service.slice(service.indexOf('async admitExisting'), service.indexOf('async admit('));

  assert.match(admitExisting, /sourceVisitId: visit\.id/);
  assert.match(admitExisting, /data: \{ status: VisitStatus\.COMPLETED, completedAt \}/);
  assert.doesNotMatch(admitExisting, /tx\.visit\.create|visitExam\.(?:delete|update)|visitDiagnosis\.(?:delete|update)/);
  assert.match(hospitalCard, /navigate\(`\/visits\/\$\{stay\.sourceVisitId\}`\)/);
  assert.match(hospitalCard, /Открыть исходный приём/);
  assert.match(visitCard, /Этот приём сохранится полностью/);
});

test('повторное выполнение не блокируется отменённым счётом, а медицинская правка не трогает цену', async () => {
  const [service, card] = await Promise.all([
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
  ]);

  assert.match(service, /existing\.status === PaymentStatus\.CANCELLED[\s\S]*resolvePaymentStatus\(existing\.totalAmount, existing\.paidAmount\)[\s\S]*tx\.bill\.update/);
  assert.match(service, /hasHospitalBillingChanged\(existing\.billItem, dto\)/);
  assert.match(service, /billItem\.quantity\.equals\(dto\.quantity\)/);
  assert.match(card, /stay\?\.bill\?\.status === 'CANCELLED'/);
});

test('температуры всех сотрудников видны, а прошлые дни идут перед будущими', async () => {
  const [sheet, card, styles] = await Promise.all([
    read('apps/web/src/features/hospital/HospitalSheet.tsx'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/styles.css'),
  ]);

  assert.match(sheet, /flatMap\(\(record\) => \[record, \.\.\.\(record\.amendments \?\? \[\]\)\]\)/);
  assert.match(sheet, /Записать температуру/);
  assert.match(card, /openNewRecord\('COMPLETED', 'TEMPERATURE'\)/);
  assert.match(styles, /\.hospital-sheet-days \{[\s\S]*gap: 10px/);
});
