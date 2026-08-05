import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('manual supply invoice supports supplier directory and multiple lines', async () => {
  const [page, api, controller, service, supplierModal] = await Promise.all([
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/web/src/features/stock/stock.api.ts'),
    read('apps/api/src/modules/stock/stock.controller.ts'),
    read('apps/api/src/modules/stock/stock.service.ts'),
    read('apps/web/src/features/stock/SupplierModal.tsx'),
  ]);
  assert.match(page, /useFieldArray\(\{ control, name: 'items' \}\)/);
  assert.match(page, /Добавить позицию/);
  assert.match(page, /name="supplierId"/);
  assert.match(page, /Поставщик выбирается из справочника/);
  assert.match(api, /createSupplier/);
  assert.match(controller, /@Post\('suppliers'\)/);
  assert.match(service, /stock\.supplier\.create/);
  assert.match(supplierModal, /Название поставщика/);
  assert.match(page, /normalizedProductSearch\.length >= 3/);
  assert.match(page, /listProducts\(\{ search: normalizedProductSearch/);
  assert.match(page, /Цена по накладной/);
  assert.match(page, /Цена продажи/);
  assert.match(service, /retailPricesUpdated/);
});

test('inventory edits incoming and sale prices before posting', async () => {
  const [schema, migration, dto, service, page] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260805000100_stock_retail_price_at_inventory/migration.sql'),
    read('apps/api/src/modules/stock/dto/create-stock-document.dto.ts'),
    read('apps/api/src/modules/stock/stock-documents.service.ts'),
    read('apps/web/src/features/stock/StockOperationsPage.tsx'),
  ]);
  assert.match(schema, /retailPrice\s+Decimal\?/);
  assert.match(migration, /ADD COLUMN "retailPrice" DECIMAL\(12,2\)/);
  assert.match(dto, /retailPrice\?: number/);
  assert.match(page, /Приходная цена/);
  assert.match(page, /Цена продажи/);
  assert.match(service, /data: \{ retailPrice: item\.retailPrice \}/);
  assert.match(service, /purchasePrice: item\.unitCost \?\? batch\.purchasePrice/);
});

test('invoice correction keeps an explicit batch link and audited stock movement', async () => {
  const [schema, migration, service, page] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260730000200_supplier_invoice_employee_workflows/migration.sql'),
    read('apps/api/src/modules/stock/stock.service.ts'),
    read('apps/web/src/features/stock/StockPage.tsx'),
  ]);
  assert.match(schema, /stockBatchId\s+String\?\s+@unique/);
  assert.match(migration, /FOREIGN KEY \("stockBatchId"\) REFERENCES "StockBatch"/);
  assert.match(service, /Исправление накладной/);
  assert.match(service, /type: StockMovementType\.CORRECTION/);
  assert.match(service, /нельзя уменьшить ниже уже использованного/);
  assert.match(page, /Исправление сохраняет историю движений/);
});

test('draft stock documents are editable and supplier returns require supplier', async () => {
  const [controller, service, page] = await Promise.all([
    read('apps/api/src/modules/stock/stock-documents.controller.ts'),
    read('apps/api/src/modules/stock/stock-documents.service.ts'),
    read('apps/web/src/features/stock/StockOperationsPage.tsx'),
  ]);
  assert.match(controller, /@Patch\('documents\/:documentId'\)/);
  assert.match(service, /Изменять можно только черновик/);
  assert.match(service, /Для возврата выберите поставщика/);
  assert.match(page, /Сохранить черновик/);
  assert.match(page, /Создать корректировку/);
});

test('employee removal is reversible and preserves historical relations', async () => {
  const [controller, service, page] = await Promise.all([
    read('apps/api/src/modules/employees/employees.controller.ts'),
    read('apps/api/src/modules/employees/employees.service.ts'),
    read('apps/web/src/features/employees/EmployeesPage.tsx'),
  ]);
  assert.match(controller, /@Delete\(':employeeId'\)/);
  assert.match(controller, /@Post\(':employeeId\/restore'\)/);
  assert.match(service, /session\.deleteMany/);
  assert.match(service, /Нельзя удалить последнего активного директора/);
  assert.match(service, /action: 'employee\.archive'/);
  assert.doesNotMatch(service, /employee\.delete\(/);
  assert.match(page, /Старые приёмы, оплаты, назначения и документы останутся в истории/);
  assert.match(page, /Показывать удалённых и заблокированных/);
});
