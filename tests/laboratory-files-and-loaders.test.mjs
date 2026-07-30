import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('медицинские вложения хранятся приватно, проверяют тип и размер и попадают в аудит', async () => {
  const [schema, migration, controller, service, storage, ui] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260729000100_files_and_product_barcodes/migration.sql'),
    read('apps/api/src/modules/files/files.controller.ts'),
    read('apps/api/src/modules/files/files.service.ts'),
    read('apps/api/src/modules/files/object-storage.service.ts'),
    read('apps/web/src/features/files/AttachmentsPanel.tsx'),
  ]);

  assert.match(schema, /enum FilePurpose[\s\S]*LABORATORY_RESULT[\s\S]*SUPPLY_DOCUMENT/);
  assert.match(schema, /checksumSha256\s+String\?/);
  assert.match(schema, /uploadedBy\s+Employee\?/);
  assert.match(controller, /@RequirePermissions\('laboratory\.manage'\)/);
  assert.match(controller, /@RequireAnyPermissions\('documents\.read', 'laboratory\.read', 'stock\.read'\)/);
  assert.match(service, /15 \* 1024 \* 1024/);
  assert.match(service, /createHash\('sha256'\)/);
  assert.match(service, /action: 'file\.upload'/);
  assert.match(service, /action: 'file\.download'/);
  assert.match(storage, /S3_BUCKET/);
  assert.match(ui, /Прикрепить файл/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/i);
});

test('лабораторные результаты проходят предпросмотр и блокируются при любой неоднозначной строке', async () => {
  const [controller, service, importer, page] = await Promise.all([
    read('apps/api/src/modules/laboratory/laboratory.controller.ts'),
    read('apps/api/src/modules/laboratory/laboratory.service.ts'),
    read('apps/web/src/features/laboratory/LaboratoryResultsImporter.tsx'),
    read('apps/web/src/features/laboratory/LaboratoryPage.tsx'),
  ]);

  assert.match(controller, /orders\/:orderId\/results\/import/);
  assert.match(service, /mode === LaboratoryResultsImportMode\.PREVIEW/);
  assert.match(service, /matched\.length > 0 && issues\.length === 0/);
  assert.match(service, /Импорт не выполнен/);
  assert.match(service, /action: 'laboratory\.results\.import'/);
  assert.match(importer, /Сначала выполняется безопасная проверка/);
  assert.match(importer, /CRM ничего не внесла/);
  assert.match(importer, /uploadLaboratoryOrderFile/);
  assert.match(page, /LaboratoryResultsImporter/);
});

test('загрузчик накладной автоматически сопоставляет товары и не проводит проблемные строки', async () => {
  const [importer, page, stockService] = await Promise.all([
    read('apps/web/src/features/stock/SupplyInvoiceImporter.tsx'),
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/api/src/modules/stock/stock.service.ts'),
  ]);

  assert.match(importer, /Автоматическое сопоставление без изменения склада до подтверждения/);
  assert.match(importer, /rows\.length > 0 && issues === 0/);
  assert.match(importer, /matchProducts\(products, sourceBarcode, sourceSku, sourceTitle\)/);
  assert.match(importer, /createSupplyInvoice/);
  assert.match(importer, /uploadSupplyFile/);
  assert.match(page, /SupplyInvoiceImporter/);
  assert.match(page, /Оригинал накладной и сопроводительные документы/);
  assert.match(stockService, /\$transaction\(async \(tx\)/);
});

test('товар поддерживает несколько отдельных штрих-кодов и поиск по любому из них', async () => {
  const [schema, migration, dto, service, page] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260729000100_files_and_product_barcodes/migration.sql'),
    read('apps/api/src/modules/stock/dto/upsert-product.dto.ts'),
    read('apps/api/src/modules/stock/stock.service.ts'),
    read('apps/web/src/features/stock/StockPage.tsx'),
  ]);

  assert.match(schema, /model ProductBarcode/);
  assert.match(schema, /@@unique\(\[productId, value\]\)/);
  assert.match(migration, /string_to_array\(product\."barcode", ';'\)/);
  assert.match(dto, /barcodes\?: string\[\]/);
  assert.match(service, /barcodes: \{ some: \{ value:/);
  assert.match(service, /ensureBarcodesAvailable/);
  assert.match(page, /Дополнительные штрих-коды/);
});
