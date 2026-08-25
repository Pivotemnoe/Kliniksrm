import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('сотрудник с правом приёма оплат получает способы оплаты и кассы', async () => {
  const controller = await read('apps/api/src/modules/finance/finance.controller.ts');

  assert.match(controller, /@RequireAnyPermissions\('settings\.read', 'settings\.manage', 'payments\.manage'\)/);
});

test('врач по умолчанию может принимать оплату', async () => {
  const [seed, migration] = await Promise.all([
    read('prisma/seed.cjs'),
    read('prisma/migrations/20260825000100_doctor_payment_permission/migration.sql'),
  ]);
  const doctorRole = seed.slice(seed.indexOf("'doctor'"), seed.indexOf("'assistant'"));

  assert.match(doctorRole, /'payments\.manage'/);
  assert.match(migration, /r\."code" = 'doctor'/);
  assert.match(migration, /p\."code" = 'payments\.manage'/);
  assert.match(migration, /ON CONFLICT \("roleId", "permissionId"\) DO NOTHING/);
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP|TRUNCATE)\b/i);
});

test('форма оплаты показывает один способ оплаты и обязательную кассу', async () => {
  const page = await read('apps/web/src/features/billing/BillCardPage.tsx');
  const paymentModal = page.slice(page.indexOf('function PaymentModal'), page.indexOf('function getPaymentDefaults'));

  assert.match(paymentModal, /label="Способ оплаты" required/);
  assert.match(paymentModal, /label="Касса" required/);
  assert.doesNotMatch(paymentModal, /label="Тип оплаты"/);
  assert.match(paymentModal, /preferredMethod = activePaymentMethods\.find\(\(item\) => item\.type === 'CARD'\)/);
});

test('массовая оплата также не дублирует тип и способ оплаты', async () => {
  const page = await read('apps/web/src/features/billing/BillsPage.tsx');
  const paymentModal = page.slice(page.indexOf('function BulkPaymentModal'), page.indexOf('function getInitialStatusFilter'));

  assert.match(paymentModal, /name="paymentMethodId" label="Способ оплаты" rules=/);
  assert.match(paymentModal, /name="cashboxId" label="Касса" rules=/);
  assert.match(paymentModal, /name="type" hidden/);
  assert.doesNotMatch(paymentModal, /label="Тип оплаты"/);
});

test('выбранный справочный способ оплаты определяет технический тип операции', () => {
  const { resolvePaymentType } = require('../apps/api/dist/modules/finance/finance.service.js');

  assert.equal(resolvePaymentType('CASH', 'CARD'), 'CARD');
  assert.equal(resolvePaymentType('BANK_TRANSFER'), 'BANK_TRANSFER');
});
