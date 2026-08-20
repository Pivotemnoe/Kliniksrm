import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('магазин хранит собственные товары без связей со складом и финансами клиники', async () => {
  const [schema, migration, service, reports, business] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260820000300_store_catalog/migration.sql'),
    read('apps/api/src/modules/store/store.service.ts'),
    read('apps/api/src/modules/reports/reports.service.ts'),
    read('apps/api/src/modules/business/business.service.ts'),
  ]);

  const model = schema.match(/model StoreProduct \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(model, /title\s+String/);
  assert.match(model, /retailPrice\s+Decimal/);
  assert.doesNotMatch(model, /Product\?|Service\?|Sale|Bill|Stock|Business|Income|Expense/);
  assert.doesNotMatch(migration, /FOREIGN KEY|REFERENCES/);
  assert.doesNotMatch(`${reports}\n${business}`, /StoreProduct|storeProduct/);
  assert.match(service, /this\.prisma\.storeProduct/);
  assert.doesNotMatch(service, /this\.prisma\.(?:product|service|sale|bill|stockMovement|businessEntry)/);
});

test('товары магазина добавляются вручную и загружаются только после предпросмотра', async () => {
  const [controller, importer, api] = await Promise.all([
    read('apps/api/src/modules/store/store.controller.ts'),
    read('apps/web/src/features/store/StoreProductImporter.tsx'),
    read('apps/web/src/features/store/store.api.ts'),
  ]);

  assert.match(controller, /@Controller\('v1\/store'\)/);
  assert.match(controller, /@Post\('products\/import'\)/);
  assert.match(controller, /@RequirePermissions\('store\.manage'\)/);
  assert.match(importer, /Готово к загрузке/);
  assert.match(importer, /Загрузка не создаёт товары и услуги клиники/);
  assert.match(importer, /XLS, XLSX, CSV или DOCX/);
  assert.match(api, /\/v1\/store\/products\/import/);
});

test('массовая печать задаёт отдельное количество каждой позиции и поддерживает оба контура', async () => {
  const [printer, storePrinter, clinicPrinter, stockPage, routes, menu] = await Promise.all([
    read('apps/web/src/shared/ui/CatalogLabelPrinter.tsx'),
    read('apps/web/src/features/store/StoreLabelPrinter.tsx'),
    read('apps/web/src/features/stock/StockCatalogLabelPrinter.tsx'),
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/web/src/app/routes.tsx'),
    read('apps/web/src/layouts/menu.tsx'),
  ]);

  assert.match(printer, /line\.copies/);
  assert.match(printer, /Array\.from\(\{ length: line\.copies \}/);
  assert.match(printer, /Этикетка 58 × 40 мм/);
  assert.match(printer, /Лист A4 \(сетка\)/);
  assert.match(printer, /renderBarcodeSvg/);
  assert.match(storePrinter, /STORE_PRODUCT/);
  assert.match(clinicPrinter, /PRODUCT/);
  assert.match(clinicPrinter, /SERVICE/);
  assert.match(clinicPrinter, /listProducts/);
  assert.match(clinicPrinter, /listServices/);
  assert.match(stockPage, /Печать ценников и этикеток/);
  assert.match(routes, /\/store\/labels/);
  assert.match(routes, /\/stock\/labels/);
  assert.match(menu, /Товары магазина/);
  assert.match(menu, /Ценники и этикетки/);
});
