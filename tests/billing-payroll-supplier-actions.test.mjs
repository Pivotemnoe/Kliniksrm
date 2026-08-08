import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const projectRoot = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

test('фильтр счетов отделяет нулевые суммы для массового выбора', () => {
  const { buildBillWhere } = require('../apps/api/dist/modules/billing/billing.service.js');
  assert.deepEqual(buildBillWhere({ amount: 'ZERO' }).totalAmount, { equals: 0 });
  assert.deepEqual(buildBillWhere({ amount: 'POSITIVE' }).totalAmount, { gt: 0 });
});

test('разовая зарплата создаёт строку сотрудника даже без правил начисления', () => {
  const { PayrollAdjustmentType, Prisma } = require('@prisma/client');
  const { calculateManualPayrollEntry } = require('../apps/api/dist/modules/payroll/payroll.service.js');
  const decimal = (value) => new Prisma.Decimal(value);
  const employee = { id: 'employee-1', fullName: 'Разовый сотрудник' };
  const entry = calculateManualPayrollEntry(employee, [
    { employeeId: employee.id, type: PayrollAdjustmentType.MANUAL_SALARY, amount: decimal(3500) },
    { employeeId: employee.id, type: PayrollAdjustmentType.ADJUSTMENT, amount: decimal(500) },
    { employeeId: employee.id, type: PayrollAdjustmentType.ADJUSTMENT, amount: decimal(-200) },
  ]);

  assert.equal(entry.employeeName, employee.fullName);
  assert.equal(entry.manualAmount.toString(), '3500');
  assert.equal(entry.adjustmentAmount.toString(), '300');
  assert.equal(entry.totalAmount.toString(), '3800');
  assert.equal(entry.snapshot.manualOnly, true);
});

test('ручная зарплата отделена от премий в обычной строке расчёта', () => {
  const { PayrollAdjustmentType, Prisma } = require('@prisma/client');
  const { calculateEmployeePayroll } = require('../apps/api/dist/modules/payroll/payroll.service.js');
  const decimal = (value) => new Prisma.Decimal(value);
  const profile = {
    id: 'profile-1', employeeId: 'employee-1', fixedAmount: decimal(1000), shiftRate: decimal(0),
    servicePercent: decimal(0), productPercent: decimal(0), isActive: true,
    employee: { id: 'employee-1', fullName: 'Сотрудник' }, serviceRules: [], productRules: [],
  };
  const entry = calculateEmployeePayroll(profile, [], [], [
    { employeeId: 'employee-1', type: PayrollAdjustmentType.MANUAL_SALARY, amount: decimal(2500) },
    { employeeId: 'employee-1', type: PayrollAdjustmentType.ADJUSTMENT, amount: decimal(-100) },
  ]);

  assert.equal(entry.manualAmount.toString(), '2500');
  assert.equal(entry.adjustmentAmount.toString(), '-100');
  assert.equal(entry.totalAmount.toString(), '3400');
});

test('финансовые массовые действия атомарны и видимы в интерфейсе', async () => {
  const [service, controller, page] = await Promise.all([
    read('apps/api/src/modules/billing/billing.service.ts'),
    read('apps/api/src/modules/billing/billing.controller.ts'),
    read('apps/web/src/features/billing/BillsPage.tsx'),
  ]);
  assert.match(controller, /bulk-cancel/);
  assert.match(controller, /bulk-pay/);
  assert.match(service, /bill\.bulk_cancel/);
  assert.match(service, /payment\.bulk_create/);
  assert.match(service, /await this\.prisma\.\$transaction/);
  assert.match(page, /Только нулевые/);
  assert.match(page, /Выбрать все найденные/);
  assert.match(page, /Оплатить выбранные/);
  assert.match(page, /Отменить выбранные/);
});

test('миграция ручной зарплаты только добавляет данные и сохраняет старые корректировки', async () => {
  const migration = await read('prisma/migrations/20260808000100_payroll_manual_accruals/migration.sql');
  assert.match(migration, /PayrollAdjustmentType/);
  assert.match(migration, /MANUAL_SALARY/);
  assert.match(migration, /ADD COLUMN "manualAmount"/);
  assert.match(migration, /DEFAULT 'ADJUSTMENT'/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('оплата накладной доступна из карточки и защищена от переплаты', async () => {
  const [page, service] = await Promise.all([
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/api/src/modules/stock/stock-documents.service.ts'),
  ]);
  assert.match(page, /Оплатить накладную/);
  assert.match(page, /Оплата будет привязана именно к этой накладной/);
  assert.match(service, /Накладная уже полностью оплачена/);
  assert.match(service, /Сумма оплаты больше долга по накладной/);
});

test('адаптивная CRM локально проверена и ожидает приёмку на реальных устройствах', async () => {
  const plan = JSON.parse(await read('docs/product/temichevvet-improvement-plan.json'));
  const item = plan.items.find((candidate) => candidate.id === 'P1.5');
  assert.equal(item?.status, 'LOCAL_VERIFIED');
  assert.match(item?.title ?? '', /планшетов и телефонов/);
  assert.match(item?.next_action ?? '', /приёмку ролями врача, администратора и директора/);
  assert.match(item?.current_state ?? '', /ширинах от 320 до 1440 px/);
});
