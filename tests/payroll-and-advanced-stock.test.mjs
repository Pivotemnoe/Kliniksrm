import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const projectRoot = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

test('зарплата считается только с оплаченной доли счёта и сохраняет разбивку', () => {
  const { Prisma } = require('@prisma/client');
  const { calculateEmployeePayroll, resolvePaidShare } = require('../apps/api/dist/modules/payroll/payroll.service.js');
  const decimal = (value) => new Prisma.Decimal(value);
  assert.equal(resolvePaidShare(decimal(1000), decimal(500)), 0.5);
  assert.equal(resolvePaidShare(decimal(1000), decimal(2000)), 1);
  assert.equal(resolvePaidShare(decimal(0), decimal(500)), 0);

  const profile = {
    id: 'profile-1', employeeId: 'employee-1', fixedAmount: decimal(100), shiftRate: decimal(50),
    servicePercent: decimal(10), productPercent: decimal(5), isActive: true,
    employee: { id: 'employee-1', fullName: 'Врач' },
    serviceRules: [],
    productRules: [{ id: 'rule-1', profileId: 'profile-1', productId: 'product-1', percent: decimal(20) }],
  };
  const entry = calculateEmployeePayroll(
    profile,
    [{ employeeId: 'employee-1' }, { employeeId: 'employee-1' }],
    [{
      id: 'bill-1', totalAmount: decimal(1000), paidAmount: decimal(500),
      visit: { employeeId: 'employee-1', status: 'COMPLETED' }, sale: null,
      items: [
        { serviceId: 'service-1', productId: null, totalAmount: decimal(600) },
        { serviceId: null, productId: 'product-1', totalAmount: decimal(400) },
      ],
    }],
    [{ employeeId: 'employee-1', amount: decimal(-20) }],
  );
  assert.equal(entry.shiftCount, 2);
  assert.equal(entry.serviceRevenue.toString(), '300');
  assert.equal(entry.serviceAmount.toString(), '30');
  assert.equal(entry.productRevenue.toString(), '200');
  assert.equal(entry.productAmount.toString(), '40');
  assert.equal(entry.adjustmentAmount.toString(), '-20');
  assert.equal(entry.totalAmount.toString(), '250');
  assert.equal(entry.snapshot.sourceBills, 1);
});

test('миграция этапов 3–4 только добавляет структуры и необязательные ссылки', async () => {
  const migration = await read('prisma/migrations/20260726000100_payroll_and_advanced_stock/migration.sql');
  for (const table of ['PayrollProfile', 'PayrollPeriod', 'PayrollEntry', 'PayrollAdjustment', 'StockDocument', 'StockDocumentItem', 'SupplierPayment']) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migration, /ALTER TABLE "Sale" ADD COLUMN "employeeId" TEXT/);
  assert.match(migration, /ALTER TABLE "StockMovement"[\s\S]*ADD COLUMN "stockDocumentId" TEXT/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Owner|Animal|Visit|Bill|Payment|StockBatch)"/);
  assert.match(migration, /WHERE role\."code" = 'director'/);
});

test('складской документ защищён от повторного проведения и устаревшего остатка', async () => {
  const service = await read('apps/api/src/modules/stock/stock-documents.service.ts');
  assert.match(service, /where: \{ id: documentId, status: StockDocumentStatus\.DRAFT \}/);
  assert.match(service, /Остаток партии изменился после создания документа/);
  assert.match(service, /await this\.prisma\.\$transaction/);
  assert.match(service, /Проведённый документ нельзя отменить; создайте корректировку/);
  assert.match(service, /targetStockBatchId/);
  assert.match(service, /unitCost/);
  assert.match(service, /Выбранная партия поступила от другого поставщика/);
});

test('интерфейс показывает зарплату, складские документы и безопасное проведение', async () => {
  const [payroll, stock, reports, menu] = await Promise.all([
    read('apps/web/src/features/payroll/PayrollPage.tsx'),
    read('apps/web/src/features/stock/StockOperationsPage.tsx'),
    read('apps/web/src/features/reports/ReportsPage.tsx'),
    read('apps/web/src/layouts/menu.tsx'),
  ]);
  assert.match(payroll, /Утверждённые периоды не изменяются/);
  assert.match(payroll, /фактически оплаченн/);
  assert.match(stock, /Черновик не меняет остатки/);
  assert.match(stock, /Инвентаризация/);
  assert.match(stock, /Поставщики и расчёты/);
  assert.match(stock, /filterOption=\{false\}/);
  assert.match(stock, /needsActual \|\| Number\(batch\.rest\) > 0/);
  assert.match(stock, /useInfiniteListQuery\(\{[\s\S]*listStockDocuments\(\{ limit, offset \}\)/);
  assert.match(stock, /useInfiniteListQuery\(\{[\s\S]*listStockMovements\(\{ limit, offset \}\)/);
  assert.match(reports, /Сроки годности партий/);
  assert.match(menu, /Зарплата/);
  assert.match(menu, /Операции/);
});

test('товар без накладной ставится на остаток только проводимой инвентаризацией', async () => {
  const [service, operations, stockPage] = await Promise.all([
    read('apps/api/src/modules/stock/stock-documents.service.ts'),
    read('apps/web/src/features/stock/StockOperationsPage.tsx'),
    read('apps/web/src/features/stock/StockPage.tsx'),
  ]);

  assert.match(stockPage, /Провести инвентаризацию этого товара/);
  assert.match(operations, /новая учётная партия без накладной/);
  assert.match(operations, /inventoryProductId/);
  assert.match(service, /stockBatch\.create/);
  assert.match(service, /actual\.lessThanOrEqualTo\(0\)/);
  assert.match(service, /StockMovementType\.INVENTORY/);
  assert.match(service, /stockDocumentItem\.update/);
});
