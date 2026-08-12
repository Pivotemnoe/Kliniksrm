import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('миграция VTF и сводки директора добавочная и не меняет клинические и финансовые записи', async () => {
  const migration = await read('prisma/migrations/20260812000100_vtf_templates_reports_and_daily_briefing/migration.sql');
  assert.match(migration, /CREATE TABLE "DirectorBriefing"/);
  assert.match(migration, /VTF · лабораторные бланки \(ручные\)/);
  assert.match(migration, /LEGAL_REVIEW_REQUIRED/);
  assert.match(migration, /appointment_reminder/);
  assert.match(migration, /revaccination_reminder/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
  assert.doesNotMatch(migration, /(?:UPDATE|ALTER TABLE) "(?:Owner|Animal|Visit|Bill|Payment|StockBatch|StockMovement|SupplyInvoice)"/);
});

test('сводка директора доступна только директору и не содержит медицинской автоматики', async () => {
  const [controller, service, module, ui, alerts] = await Promise.all([
    read('apps/api/src/modules/director-briefing/director-briefing.controller.ts'),
    read('apps/api/src/modules/director-briefing/director-briefing.service.ts'),
    read('apps/api/src/app.module.ts'),
    read('apps/web/src/features/business/DirectorBriefingTab.tsx'),
    read('apps/api/src/modules/staff-alerts/staff-alerts.service.ts'),
  ]);
  assert.match(controller, /@RequireRoles\('director'\)/);
  assert.match(controller, /@Post\('generate'\)/);
  assert.match(controller, /@Patch\('settings'\)/);
  assert.match(module, /DirectorBriefingModule/);
  assert.match(service, /director_briefing\.generate/);
  assert.match(service, /Приёмы:/);
  assert.match(service, /Финансы:/);
  assert.match(service, /Долги клиентов сейчас/);
  assert.match(service, /Лаборатория:/);
  assert.doesNotMatch(service, /diagnos|диагноз|treatment|лечение/i);
  assert.match(ui, /Сформировать сейчас/);
  assert.match(ui, /Время формирования/);
  assert.match(alerts, /actor\.roles\.includes\('director'\)/);
  assert.match(alerts, /DIRECTOR_BRIEFING/);
});

test('отчёты разделяют ручную выручку и содержат расширенные вакцинации', async () => {
  const [business, businessUi, reports, reportsUi, exportUi] = await Promise.all([
    read('apps/api/src/modules/business/business.service.ts'),
    read('apps/web/src/features/business/BusinessPage.tsx'),
    read('apps/api/src/modules/reports/reports.service.ts'),
    read('apps/web/src/features/reports/ReportsPage.tsx'),
    read('apps/web/src/features/reports/reportExport.ts'),
  ]);
  assert.match(business, /const unrecordedRevenue/);
  assert.match(business, /const otherManualIncome/);
  assert.match(businessUi, /Выручка, внесённая вручную/);
  assert.match(reports, /rabiesItems/);
  assert.match(reports, /identifiedAnimals/);
  assert.match(reportsUi, /Вакцинации против бешенства/);
  assert.match(reportsUi, /Идентифицированные животные/);
  assert.match(exportUi, /sheet\('Идентификация'/);
});
