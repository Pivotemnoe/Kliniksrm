import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const projectRoot = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

test('управленческий результат разделяет прибыль и движение денег', () => {
  const { calculateManagementResult } = require('../apps/api/dist/modules/business/business.service.js');
  const result = calculateManagementResult({
    accruedSystemRevenue: 100_000,
    profitIncome: 5_000,
    costOfGoods: 20_000,
    payrollExpense: 30_000,
    operatingExpenses: 10_000,
    cashIncome: 80_000,
    refunds: 2_000,
    manualIncome: 7_000,
    manualExpense: 3_000,
    supplierOutflow: 15_000,
  });
  assert.equal(result.accruedRevenue, 105_000);
  assert.equal(result.grossProfit, 85_000);
  assert.equal(result.operatingProfit, 45_000);
  assert.equal(result.cashNet, 67_000);
  assert.equal(result.marginPercent, 45_000 / 105_000 * 100);
});

test('миграция этапа 3.5 добавочная и не меняет клинические данные', async () => {
  const migration = await read('prisma/migrations/20260726000200_business_management/migration.sql');
  for (const table of ['BusinessCategory', 'BusinessEntry', 'BusinessDailyClose', 'BusinessDailyCloseLine']) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migration, /ALTER TABLE "SupplierPayment"[\s\S]*ADD COLUMN "cashboxId" TEXT/);
  assert.match(migration, /ALTER TABLE "SupplierPayment"[\s\S]*ADD COLUMN "paymentMethodId" TEXT/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Owner|Animal|Visit|Bill|Payment|StockBatch|FileObject)"/);
});

test('администратор получает закрытие дня, а бизнес-отчёт остаётся директору', async () => {
  const [migration, seed, controller, access] = await Promise.all([
    read('prisma/migrations/20260726000200_business_management/migration.sql'),
    read('prisma/seed.cjs'),
    read('apps/api/src/modules/business/business.controller.ts'),
    read('apps/web/src/auth/access.ts'),
  ]);
  const administratorGrant = migration.match(/JOIN "Permission" permission ON permission\."code" IN \([^\n]+\)\nWHERE role\."code" = 'administrator'/)?.[0] ?? '';
  assert.match(administratorGrant, /daily_finance\.read/);
  assert.match(administratorGrant, /daily_finance\.submit/);
  assert.doesNotMatch(administratorGrant, /business\.read/);
  const administratorSeed = seed.slice(seed.indexOf("'administrator'"), seed.indexOf("'doctor'"));
  assert.match(administratorSeed, /daily_finance\.submit/);
  assert.doesNotMatch(administratorSeed, /business\.read/);
  assert.match(controller, /@RequirePermissions\('business\.read'\)[\s\S]*getSummary/);
  assert.match(access, /path: '\/business', anyOf: \['business\.read'\]/);
});

test('депозиты не считаются новой выручкой, операции не удаляются физически', async () => {
  const service = await read('apps/api/src/modules/business/business.service.ts');
  assert.match(service, /type: \{ not: PaymentType\.DEPOSIT \}/);
  assert.match(service, /status: BusinessEntryStatus\.VOIDED/);
  assert.doesNotMatch(service, /businessEntry\.delete(?:Many)?\(/);
  assert.match(service, /После отправки изменились оплаты или расходы/);
  assert.match(service, /snapshotLines/);
});

test('интерфейс этапа 3.5 показывает понятные рабочие действия', async () => {
  const [daily, business, menu, stock] = await Promise.all([
    read('apps/web/src/features/business/DailyFinancePage.tsx'),
    read('apps/web/src/features/business/BusinessPage.tsx'),
    read('apps/web/src/layouts/menu.tsx'),
    read('apps/web/src/features/stock/StockOperationsPage.tsx'),
  ]);
  assert.match(daily, /Принять суммы CRM/);
  assert.match(daily, /Отправить директору/);
  assert.match(daily, /не заменяет бухгалтерскую или налоговую отчётность/);
  assert.match(business, /Операционная прибыль/);
  assert.match(business, /Денежный поток/);
  assert.match(business, /Выгрузить CSV/);
  assert.match(menu, /Закрытие дня/);
  assert.match(menu, /label: 'Бизнес'/);
  assert.match(stock, /Касса и способ оплаты нужны, чтобы расход автоматически попал в закрытие дня/);
});

test('закрытие дня принимает свободные причины и сохраняет несколько операций одной транзакцией', async () => {
  const [modal, api, controller, service, batchDto, daily] = await Promise.all([
    read('apps/web/src/features/business/BusinessEntryModal.tsx'),
    read('apps/web/src/features/business/business.api.ts'),
    read('apps/api/src/modules/business/business.controller.ts'),
    read('apps/api/src/modules/business/business.service.ts'),
    read('apps/api/src/modules/business/dto/create-business-entries-batch.dto.ts'),
    read('apps/web/src/features/business/DailyFinancePage.tsx'),
  ]);

  assert.match(modal, /Form\.List name="items"/);
  assert.match(modal, /Причина дохода/);
  assert.match(modal, /Причина расхода/);
  assert.match(modal, /Добавить ещё доход/);
  assert.match(modal, /Добавить ещё расход/);
  assert.match(modal, /comment: item\.reason\.trim\(\)/);
  assert.match(api, /\/v1\/business\/entries\/batch/);
  assert.match(controller, /createEntriesBatch/);
  assert.match(batchDto, /ArrayMinSize\(1\)/);
  assert.match(batchDto, /ArrayMaxSize\(50\)/);
  assert.match(service, /createEntriesBatch[\s\S]*?this\.prisma\.\$transaction/);
  assert.match(service, /tx\.auditLog\.create/);
  assert.match(daily, /entry\.comment \|\| entry\.category\.title/);
});

test('утверждение закрытия дня подтверждает связанную неучтённую выручку и сохраняет аудит', async () => {
  const [service, page, migration] = await Promise.all([
    read('apps/api/src/modules/business/business.service.ts'),
    read('apps/web/src/features/business/BusinessPage.tsx'),
    read('prisma/migrations/20260810000200_business_close_resolution/migration.sql'),
  ]);

  assert.match(service, /approveDailyClose[\s\S]*?this\.prisma\.\$transaction/);
  assert.match(service, /dailyCloseId: closeId[\s\S]*?requiresResolution: true/);
  assert.match(service, /businessEntry\.updateMany/);
  assert.match(service, /business\.entry\.resolve\.daily_close/);
  assert.match(service, /resolvedEntries: unresolvedEntries\.length/);
  assert.match(page, /автоматически подтверждается директором вместе с закрытием дня/);
  assert.match(page, /Открыть операции/);
  assert.match(migration, /close\."status" = 'APPROVED'/);
  assert.match(migration, /business\.entry\.resolve\.daily_close\.backfill/);
  assert.match(migration, /"requiresResolution" = false/);
  assert.doesNotMatch(migration, /UPDATE "BusinessEntry"[\s\S]*?"amount"\s*=/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});
