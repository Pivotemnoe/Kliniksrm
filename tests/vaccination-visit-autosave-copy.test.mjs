import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('вакцинация является типом приёма и миграция только дополняет данные', async () => {
  const [schema, migration, visitTypes, visitExam] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260827000100_vaccination_visit_workflow/migration.sql'),
    read('apps/web/src/features/visits/types.ts'),
    read('apps/web/src/features/visits/VisitExamTab.tsx'),
  ]);

  assert.match(schema, /enum VisitType[\s\S]*VACCINATION/);
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'VACCINATION'/);
  assert.doesNotMatch(migration, /^\s*(?:DROP\b|DELETE\s+FROM\b|TRUNCATE\b|UPDATE\s+)/im);
  assert.match(visitTypes, /VACCINATION: 'Вакцинация'/);
  assert.match(visitExam, /'VACCINATION'/);
  assert.match(visitExam, /label="Состояние"/);
});

test('вакцина из каталога и услуга добавляются в тот же приём и удаляются только до оплаты', async () => {
  const [service, form, controller] = await Promise.all([
    read('apps/api/src/modules/animals/animals.service.ts'),
    read('apps/web/src/features/animals/VaccinationFormDrawer.tsx'),
    read('apps/api/src/modules/animals/animals.controller.ts'),
  ]);

  assert.match(service, /private async createVisitVaccination/);
  assert.match(service, /productBillItem = await tx\.billItem\.create/);
  assert.match(service, /serviceBillItem = service/);
  assert.match(service, /paidAmount\)\.greaterThan\(0\)/);
  assert.match(service, /action: 'vaccination\.cancel'/);
  assert.match(form, /Вакцина из товаров/);
  assert.match(form, /Складское списание произойдёт после полной оплаты счёта/);
  assert.match(controller, /@Delete\(':animalId\/vaccinations\/:vaccinationId'\)/);
});

test('копирование прошлого приёма переносит только позиции без оплаты и складских движений', async () => {
  const [service, controller, tab] = await Promise.all([
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('apps/api/src/modules/visits/visits.controller.ts'),
    read('apps/web/src/features/visits/VisitServicesTab.tsx'),
  ]);
  const method = service.slice(service.indexOf('async copyPreviousServices'), service.indexOf('async updateService'));

  assert.match(controller, /services\/copy-previous/);
  assert.match(method, /tx\.billItem\.create/);
  assert.doesNotMatch(method, /payment|stockMovement\.create/);
  assert.match(service, /vaccination: null, vaccinationService: null/);
  assert.match(tab, /Скопировать прошлые товары и услуги/);
  assert.match(tab, /Оплата и складские списания прошлого приёма не копируются/);
});

test('лист осмотра хранит локальный черновик и сохраняется в CRM после паузы', async () => {
  const tab = await read('apps/web/src/features/visits/VisitExamTab.tsx');

  assert.match(tab, /temichevvet:visit-exam-draft:/);
  assert.match(tab, /localStorage\.setItem/);
  assert.match(tab, /setTimeout\(\(\) => \{/);
  assert.match(tab, /}, 900\)/);
  assert.match(tab, /silent: true/);
  assert.match(tab, /Черновик сохранён на этом компьютере/);
  assert.match(tab, /Сохранено автоматически/);
});

test('клиентский каталог сохраняет серверное ранжирование совпадений', async () => {
  const picker = await read('apps/web/src/features/stock/useCatalogPicker.ts');
  assert.match(picker, /API already returns exact\/prefix matches first/);
  assert.doesNotMatch(picker, /localeCompare/);
});
