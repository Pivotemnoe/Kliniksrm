import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('отчёт использует календарные границы клиники и отклоняет обратный период', () => {
  const { resolveReportRange } = require('../apps/api/dist/modules/reports/report-range.js');
  const range = resolveReportRange({ from: '2026-07-01', to: '2026-07-31' });
  assert.equal(range.start.toISOString(), '2026-06-30T21:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-07-31T20:59:59.999Z');
  assert.throws(() => resolveReportRange({ from: '2026-08-01', to: '2026-07-31' }), /Дата начала/);
  assert.throws(() => resolveReportRange({ from: '2026-02-31', to: '2026-03-01' }), /некорректная дата/);
});

test('версия для пользователя берётся из установленного комплекта или образа', () => {
  const { resolveReleaseVersion } = require('../apps/api/dist/modules/meta/meta.controller.js');
  assert.equal(resolveReleaseVersion({ CRM_SOURCE_VERSION: '8144d18ca9b1517b' }), '8144d18ca9b1');
  assert.equal(resolveReleaseVersion({ CRM_SOURCE_VERSION: 'local', TEMICHEVVET_GIT_COMMIT: 'abc123456789zzz' }), 'abc123456789');
  assert.equal(resolveReleaseVersion({}), 'локальная');
});

test('управленческий отчёт считает оплаты, долг, себестоимость и склад без записи в БД', async () => {
  const { ReportsService } = require('../apps/api/dist/modules/reports/reports.service.js');
  const employee = { id: 'employee-1', fullName: 'Врач', position: 'Ветеринарный врач' };
  const bill = {
    id: 'bill-1', createdAt: new Date('2026-07-10T10:00:00Z'), totalAmount: 1500, paidAmount: 1100,
    owner: { id: 'owner-1', fullName: 'Владелец' }, visit: { employee },
    items: [
      { serviceId: 'service-1', productId: null, title: 'Приём', quantity: 1, discount: 0, totalAmount: 1000 },
      { serviceId: null, productId: 'product-1', title: 'Препарат', quantity: 2, discount: 0, totalAmount: 500 },
    ],
  };
  const debtBill = {
    id: 'bill-1', createdAt: bill.createdAt, dueAt: null, totalAmount: 1500, paidAmount: 1100,
    owner: { id: 'owner-1', fullName: 'Владелец', phone: '+70000000000' },
  };
  const prisma = {
    bill: { findMany: async ({ where }) => where.createdAt ? [bill] : [debtBill] },
    payment: { findMany: async () => [
      { id: 'payment-1', paidAt: new Date('2026-07-10T10:10:00Z'), amount: 1200, type: 'CARD', paymentMethod: { id: 'card', title: 'Карта' }, cashbox: null },
      { id: 'payment-2', paidAt: new Date('2026-07-10T10:15:00Z'), amount: -100, type: 'CARD', paymentMethod: { id: 'card', title: 'Карта' }, cashbox: null },
    ] },
    owner: { aggregate: async () => ({ _sum: { balance: 300 } }), count: async () => 1 },
    visit: { findMany: async () => [{ id: 'visit-1', ownerId: 'owner-1', status: 'COMPLETED', startedAt: bill.createdAt, totalAmount: 1500, employee }] },
    appointment: { findMany: async () => [{ id: 'appointment-1', status: 'COMPLETED', startsAt: bill.createdAt }] },
    vaccination: { findMany: async ({ where }) => where.vaccinatedAt ? [{ id: 'vaccination-1', title: 'Бешенство', vaccinatedAt: bill.createdAt }] : [] },
    stockBatch: { findMany: async () => [{ id: 'batch-1', rest: 2, purchasePrice: 100, expiresAt: null, product: { id: 'product-1', title: 'Препарат', retailPrice: 160, minStock: 3, stockUnit: 'шт' }, warehouse: { id: 'warehouse-1', name: 'Основной склад' } }] },
    stockMovement: { findMany: async () => [{ type: 'SALE', quantity: -2, billItemId: null, visitId: null, saleId: 'sale-1', stockBatch: { purchasePrice: 100 } }] },
    supplyInvoice: { findMany: async () => [{ id: 'supply-1', totalAmount: 800 }] },
    employee: { findMany: async () => [employee] },
  };
  const report = await new ReportsService(prisma).getSummary({ from: '2026-07-01', to: '2026-07-31' });
  assert.equal(report.finance.billedAmount, 1500);
  assert.equal(report.finance.paidAmount, 1100);
  assert.equal(report.finance.refundedAmount, 100);
  assert.equal(report.finance.debtAmount, 400);
  assert.equal(report.profit.costOfGoods, 200);
  assert.equal(report.profit.grossProfit, 1300);
  assert.equal(report.stock.purchaseValue, 200);
  assert.equal(report.stock.lowStock, 1);
  assert.equal(report.sales.services[0].title, 'Приём');
  assert.equal(report.sales.products[0].title, 'Препарат');
});

test('экран отчётов не содержит технических статусов и предлагает Excel и PDF', async () => {
  const [reportsPage, settingsPage] = await Promise.all([
    readFile(new URL('../apps/web/src/features/reports/ReportsPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/features/settings/SettingsOverviewPage.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(reportsPage, /Скачать для Excel/);
  assert.match(reportsPage, /Печать \/ PDF/);
  assert.doesNotMatch(settingsPage, />В работе</);
  assert.doesNotMatch(settingsPage, />Работает</);
});

test('выпускной интерфейс группирует финансы и выравнивает меню и карточки настроек', async () => {
  const [menu, layout, styles, settingsPage, errors] = await Promise.all([
    readFile(new URL('../apps/web/src/layouts/menu.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/layouts/CrmLayout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/features/settings/SettingsOverviewPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/src/api/errors.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(menu, /key: '\/finance-workspace'/);
  for (const label of ['Отчёты', 'Закрытие дня', 'Бизнес', 'Зарплата', 'Счета', 'Продажи']) {
    assert.match(menu, new RegExp(`label: '${label}'`));
  }
  assert.match(styles, /\.crm-sider \.ant-menu-submenu-title/);
  assert.match(styles, /\.ant-menu-submenu-selected > \.ant-menu-submenu-title/);
  assert.match(settingsPage, /settings-overview-card-body/);
  assert.match(settingsPage, /settings-overview-card-copy/);
  assert.match(layout, /canReadBusiness \? '\/business' : '\/settings\/finance'/);
  assert.match(layout, /Финансы и отчётность клиники/);
  assert.match(errors, /Нет связи с CRM\. Проверьте подключение и повторите попытку/);
});
