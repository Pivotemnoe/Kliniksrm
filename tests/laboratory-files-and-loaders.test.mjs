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

test('лабораторный журнал использует документ анализа для атомарной таблицы, отмены и печати A5', async () => {
  const [controller, service, page, visitTab, printer, formParser, api, migration, documentsPage] = await Promise.all([
    read('apps/api/src/modules/laboratory/laboratory.controller.ts'),
    read('apps/api/src/modules/laboratory/laboratory.service.ts'),
    read('apps/web/src/features/laboratory/LaboratoryPage.tsx'),
    read('apps/web/src/features/visits/VisitLaboratoryTab.tsx'),
    read('apps/web/src/features/laboratory/laboratoryPrint.ts'),
    read('apps/api/src/modules/laboratory/laboratory-document-form.ts'),
    read('apps/web/src/features/laboratory/laboratory.api.ts'),
    read('prisma/migrations/20260814000100_laboratory_test_document_forms/migration.sql'),
    read('apps/web/src/features/documents/DocumentTemplatesPage.tsx'),
  ]);

  assert.match(controller, /@Patch\('orders\/:orderId\/results'\)/);
  assert.match(service, /laboratory\.results_table\.update/);
  assert.match(service, /Сначала заполните результаты всех показателей/);
  assert.match(service, /Отменённый приём не принимает результаты/);
  assert.match(api, /updateLaboratoryOrderResults/);
  assert.match(page, /Заполнить таблицу/);
  assert.match(page, /cancelVisitLaboratoryOrder/);
  assert.match(page, /Сохранить всю таблицу/);
  assert.match(page, /name="documentTemplateId"/);
  assert.match(page, /Настроить/);
  assert.match(page, /Открыть редактор выбранного документа/);
  assert.match(page, /\/settings\/documents\?tab=documents&templateId=/);
  assert.match(documentsPage, /initialTemplateId=\{searchParams\.get\('templateId'\) \?\? undefined\}/);
  assert.match(documentsPage, /openedTemplateIdRef\.current = initialTemplateId/);
  assert.match(documentsPage, /openEdit\(template\)/);
  assert.match(visitTab, /Заполнить показатели/);
  assert.match(visitTab, /Печать A5/);
  assert.match(printer, /@page \{ size: A5 portrait; margin: 0; \}/);
  assert.match(printer, /snapshot\.documentTemplateTitle/);
  assert.match(formParser, /extractLaboratoryDocumentIndicators/);
  assert.match(migration, /ADD COLUMN "documentTemplateId"/);
  assert.match(migration, /ADD COLUMN "formSnapshots"/);
  assert.doesNotMatch(migration, /INSERT INTO|UPDATE "Laboratory|DELETE FROM|TRUNCATE|DROP TABLE/i);
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
