import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('товары и услуги можно редактировать из списка', async () => {
  const page = await read('apps/web/src/features/stock/StockPage.tsx');
  const api = await read('apps/web/src/features/stock/stock.api.ts');

  assert.match(page, /icon=\{<EditOutlined \/>\}/);
  assert.match(page, /updateProduct\(product\.id/);
  assert.match(page, /updateService\(service\.id/);
  assert.match(api, /method: 'PATCH'/);
});

test('товары и услуги удаляются из каталога без разрушения медицинской и складской истории', async () => {
  const [schema, migration, controller, service, page, api] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260807000200_catalog_item_archiving/migration.sql'),
    read('apps/api/src/modules/stock/stock.controller.ts'),
    read('apps/api/src/modules/stock/stock.service.ts'),
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/web/src/features/stock/stock.api.ts'),
  ]);

  assert.match(schema, /model Product \{[\s\S]*?isActive\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /model Service \{[\s\S]*?isActive\s+Boolean\s+@default\(true\)/);
  assert.match(migration, /ALTER TABLE "Product" ADD COLUMN "isActive"/);
  assert.match(migration, /ALTER TABLE "Service" ADD COLUMN "isActive"/);
  assert.doesNotMatch(migration, /DROP|TRUNCATE|DELETE\s+FROM/i);
  assert.match(controller, /@Delete\('products\/:productId'\)/);
  assert.match(controller, /@Delete\('services\/:serviceId'\)/);
  assert.match(service, /action: 'stock\.product\.archive'/);
  assert.match(service, /action: 'stock\.service\.archive'/);
  assert.match(service, /Текущий остаток/);
  assert.match(service, /recordStatus: HospitalRecordStatus\.PLANNED/);
  assert.doesNotMatch(service, /prisma\.(?:product|service)\.delete\(/);
  assert.match(page, /Действия <DownOutlined/);
  assert.match(page, /label: 'Открыть'/);
  assert.match(page, /label: 'Изменить'/);
  assert.match(page, /label: 'Удалить'/);
  assert.match(page, /останется в старых счетах/);
  assert.match(api, /\/v1\/stock\/products\/\$\{productId\}[\s\S]*?method: 'DELETE'/);
  assert.match(api, /\/v1\/stock\/services\/\$\{serviceId\}[\s\S]*?method: 'DELETE'/);
});

test('единицы выбираются из справочника и пересчитываются при списании', async () => {
  const page = await read('apps/web/src/features/stock/StockPage.tsx');
  const units = await read('apps/api/src/modules/stock/stock-units.ts');
  const visits = await read('apps/api/src/modules/visits/visits.service.ts');
  const billing = await read('apps/api/src/modules/billing/billing.service.ts');
  const sales = await read('apps/api/src/modules/sales/sales.service.ts');

  assert.match(page, /'флакон'.*'мл'.*'л'.*'г'.*'кг'/s);
  assert.match(page, /Храним на складе в/);
  assert.match(page, /Списываем при использовании в/);
  assert.match(units, /quantity\.div\(packageQuantity\)/);
  assert.match(visits, /toStockQuantity\(product, line\.stockQuantity \?\? line\.quantity\)/);
  assert.match(billing, /toStockQuantity\(product, line\.stockQuantity \?\? line\.quantity\)/);
  assert.match(sales, /toStockQuantity\(product, line\.quantity\)/);
});

test('товар хранит точную дату годности и умеет создавать внутренний EAN-13', async () => {
  const schema = await read('prisma/schema.prisma');
  const service = await read('apps/api/src/modules/stock/stock.service.ts');
  const page = await read('apps/web/src/features/stock/StockPage.tsx');

  assert.match(schema, /defaultExpiresAt\s+DateTime\?/);
  assert.match(service, /ean13CheckDigit/);
  assert.match(page, /создать внутренний штрих-код EAN-13/i);
  assert.match(page, /Годен до/);
});

test('объём списания товара отделён от количества и цены для клиента', async () => {
  const schema = await read('prisma/schema.prisma');
  const migration = await read('prisma/migrations/20260728000400_billing_and_stock_quantities/migration.sql');
  const visitPage = await read('apps/web/src/features/visits/VisitServicesTab.tsx');
  const visitService = await read('apps/api/src/modules/visits/visits.service.ts');

  assert.match(schema, /billingUnit\s+String\?/);
  assert.match(schema, /stockQuantity\s+Decimal\?/);
  assert.match(migration, /ADD COLUMN "billingUnit" TEXT/);
  assert.match(migration, /ADD COLUMN "stockQuantity" DECIMAL\(12,3\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/i);
  assert.match(visitPage, /Списать со склада/);
  assert.match(visitPage, /Начислить клиенту/);
  assert.match(visitPage, /Цена за 1/);
  assert.match(visitService, /stockQuantity: serviceLine\.stockQuantity/);
});

test('категории имеют готовый справочник и новые значения сохраняются автоматически', async () => {
  const page = await read('apps/web/src/features/stock/StockPage.tsx');
  const service = await read('apps/api/src/modules/stock/stock.service.ts');

  assert.match(page, /Лекарственные препараты/);
  assert.match(page, /Процедуры и манипуляции/);
  assert.match(page, /она сохранится автоматически/);
  assert.match(service, /resolveProductCategoryId/);
  assert.match(service, /resolveServiceCategoryId/);
});

test('товары фильтруются по нулевому остатку и сортируются по названию, группе и количеству', async () => {
  const [page, api, dto, service] = await Promise.all([
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/web/src/features/stock/stock.api.ts'),
    read('apps/api/src/modules/stock/dto/list-stock-query.dto.ts'),
    read('apps/api/src/modules/stock/stock.service.ts'),
  ]);

  assert.match(page, /Только нулевые/);
  assert.match(page, /Только в наличии/);
  assert.match(page, /По названию/);
  assert.match(page, /По группе/);
  assert.match(page, /По остатку/);
  assert.match(page, /Все группы/);
  assert.match(api, /ProductStockState = 'all' \| 'zero' \| 'positive'/);
  assert.match(dto, /stockState\?: 'all' \| 'zero' \| 'positive'/);
  assert.match(dto, /sortBy\?: 'title' \| 'category' \| 'stockRest'/);
  assert.match(service, /stockBatch\.groupBy/);
  assert.match(service, /item\.stockRest\.equals\(0\)/);
  assert.match(service, /compareProductListItems/);
});

test('ценник печатает графический штрих-код и реквизиты организации', async () => {
  const page = await read('apps/web/src/features/stock/StockPage.tsx');
  const service = await read('apps/api/src/modules/stock/stock.service.ts');

  assert.match(page, /JsBarcode/);
  assert.match(page, /Название клиники/);
  assert.match(page, /Юридическое наименование/);
  assert.match(page, /BarcodeGraphic/);
  assert.match(page, /renderBarcodeSvg/);
  assert.match(service, /organization\.findFirst/);
});

test('список счетов не показывает технический UUID и даёт прямую оплату', async () => {
  const listPage = await read('apps/web/src/features/billing/BillsPage.tsx');
  const cardPage = await read('apps/web/src/features/billing/BillCardPage.tsx');

  assert.doesNotMatch(listPage, /record\.id\.slice\(0, 8\)/);
  assert.doesNotMatch(cardPage, /bill\.id\.slice\(0, 8\)/);
  assert.match(listPage, /Оплатить/);
  assert.match(cardPage, /Оплатить \{formatMoney\(debt\)\}/);
  assert.match(cardPage, /setPayOpen\(true\)/);
});

test('печать открывается через редактор макета, а не напрямую', async () => {
  const stockPage = await read('apps/web/src/features/stock/StockPage.tsx');
  const billPage = await read('apps/web/src/features/billing/BillCardPage.tsx');

  assert.match(stockPage, /Редактор печати ценника/);
  assert.match(stockPage, /Этикетка 58 × 40 мм/);
  assert.match(stockPage, /Лист A4 \(сетка\)/);
  assert.match(billPage, /Редактор печати счёта \/ чека/);
  assert.match(billPage, /Лента 80 мм/);
  assert.match(billPage, /Лента 58 мм/);
});

test('врач по умолчанию может создавать и редактировать клиентов', async () => {
  const migration = await read('prisma/migrations/20260728000300_doctor_owner_permissions/migration.sql');
  const seed = await read('prisma/seed.cjs');

  assert.match(migration, /r\."code" = 'doctor'/);
  assert.match(migration, /p\."code" = 'owners\.manage'/);
  assert.match(seed, /\[\s*'doctor',[\s\S]*?'owners\.manage'/);
});
