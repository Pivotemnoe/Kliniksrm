import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('поиск товара и услуги идёт по полному серверному каталогу с первого символа', async () => {
  const [picker, visit, bill, sale, stock, hospital] = await Promise.all([
    read('apps/web/src/features/stock/useCatalogPicker.ts'),
    read('apps/web/src/features/visits/VisitServicesTab.tsx'),
    read('apps/web/src/features/billing/BillCardPage.tsx'),
    read('apps/web/src/features/sales/SalesPage.tsx'),
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
  ]);

  assert.match(picker, /listProducts\(\{ search: search \|\| undefined/);
  assert.match(picker, /listServices\(\{ search: search \|\| undefined/);
  assert.match(picker, /useDeferredValue/);
  assert.match(picker, /knownItems/);
  for (const page of [visit, bill, sale]) {
    assert.match(page, /useProductCatalogPicker/);
    assert.match(page, /useServiceCatalogPicker/);
    assert.match(page, /filterOption=\{false\}/);
    assert.match(page, /onSearch=\{productsQuery\.onSearch\}/);
  }
  assert.doesNotMatch(stock, /normalizedProductSearch\.length >= 3/);
  assert.doesNotMatch(stock, /Введите минимум 3 символа/);
  assert.match(hospital, /title: \{ contains: search, mode: 'insensitive' \}/);
  assert.match(hospital, /barcodes: \{ some: \{ value: \{ contains: search/);
});

test('лабораторный бланк редактируется как таблица по ячейкам', async () => {
  const [editor, visitDocuments, styles] = await Promise.all([
    read('apps/web/src/features/documents/DocumentVisualEditor.tsx'),
    read('apps/web/src/features/visits/VisitDocumentsTab.tsx'),
    read('apps/web/src/styles.css'),
  ]);

  assert.match(editor, /DocumentTableGridEditor/);
  assert.match(editor, /Нажмите нужную ячейку и введите значение/);
  assert.match(editor, /placeholder=\{rowIndex < block\.headerRows \? 'Заголовок' : 'Введите значение'\}/);
  assert.match(editor, /Добавить строку/);
  assert.match(editor, /Добавить столбец/);
  assert.doesNotMatch(editor, /столбцы разделяются символом \|/);
  assert.match(visitDocuments, /width="min\(1280px, calc\(100vw - 24px\)\)"/);
  assert.match(styles, /\.document-table-grid-scroll/);
});

test('полностью удаляется только пустая карточка пациента, история блокирует удаление', async () => {
  const [controller, service, api, card, ownerAnimals] = await Promise.all([
    read('apps/api/src/modules/animals/animals.controller.ts'),
    read('apps/api/src/modules/animals/animals.service.ts'),
    read('apps/web/src/features/animals/animals.api.ts'),
    read('apps/web/src/features/animals/AnimalCardPage.tsx'),
    read('apps/web/src/features/owners/OwnerAnimalsTab.tsx'),
  ]);

  assert.match(controller, /@Delete\(':animalId'\)/);
  assert.match(controller, /@RequirePermissions\('animals\.manage'\)/);
  assert.match(service, /animalDeletionBlockers/);
  assert.match(service, /Медицинская, финансовая и складская история должна сохраниться/);
  assert.match(service, /await tx\.animal\.delete/);
  assert.match(service, /action: 'animal\.delete'/);
  assert.match(api, /method: 'DELETE'/);
  assert.match(card, /Удалить пациента/);
  assert.match(ownerAnimals, /Удалить пустую карточку/);
});
