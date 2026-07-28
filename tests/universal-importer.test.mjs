import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('универсальный загрузчик принимает старый Excel и таблицы Word', async () => {
  const page = await readFile('apps/web/src/features/imports/VetafImportPage.tsx', 'utf8');
  const parser = await readFile('apps/web/src/features/imports/import-file-parser.ts', 'utf8');
  const packageJson = JSON.parse(await readFile('apps/web/package.json', 'utf8'));

  assert.match(page, /accept="\.xls,\.xlsx,\.csv,\.tsv,\.txt,\.docx"/);
  assert.match(parser, /parseExcelWorkbook/);
  assert.match(parser, /parseDocxTable/);
  assert.match(parser, /detectImportKind/);
  assert.match(parser, /suggestColumnMappings/);
  assert.equal(packageJson.dependencies.xlsx, 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz');
});

test('обычный сценарий импорта автоматический и имеет явную кнопку записи', async () => {
  const page = await readFile('apps/web/src/features/imports/VetafImportPage.tsx', 'utf8');
  const parser = await readFile('apps/web/src/features/imports/import-file-parser.ts', 'utf8');

  assert.match(page, /Добавить в базу/);
  assert.match(page, /Дополнительные настройки/);
  assert.match(page, /previewMutation\.mutate\(\{/);
  assert.match(page, /document\.body\.appendChild\(link\)/);
  assert.match(page, /window\.setTimeout/);
  assert.match(page, /Пустой шаблон нужен только для подготовки нового переноса/);
  assert.match(page, /Переносов пока нет\. Выберите файл выше/);
  assert.match(parser, /detectNonImportReport/);
  assert.match(parser, /id в прежней системе/);
  assert.match(parser, /\[\.,\]/);
});

test('диапазон цены создаёт услугу с плавающей ценой и сохраняет исходное правило', async () => {
  const { DataTransferService } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  let createdData;
  const tx = {
    service: {
      findMany: async () => [],
      create: async ({ data }) => {
        createdData = data;
        return { id: 'service-1', ...data };
      },
    },
    dataTransferEntityLink: { create: async ({ data }) => data },
  };
  const service = new DataTransferService({}, { log: async () => undefined });
  await service.importCatalogRow(tx, 'batch-1', 'row-1', {
    source_id: 'docx-10',
    item_type: 'Услуга',
    title: 'Сложная перевязка',
    price: null,
    price_type: 'Плавающая',
    price_note: '575–1150',
    review_status: 'Да',
    description: 'Цена зависит от сложности',
  });

  assert.equal(createdData.priceType, 'FLOATING');
  assert.equal(createdData.price.toString(), '0');
  assert.match(createdData.description, /575–1150/);
});

test('пустая основная цена товара безопасно использует минимальную цену файла', async () => {
  const { DataTransferService } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  let createdData;
  const tx = {
    product: {
      findMany: async () => [],
      create: async ({ data }) => {
        createdData = data;
        return { id: 'product-1', ...data };
      },
    },
    dataTransferEntityLink: { create: async ({ data }) => data },
  };
  const service = new DataTransferService({}, { log: async () => undefined });
  await service.importCatalogRow(tx, 'batch-1', 'row-1', {
    source_id: 'cash-10',
    item_type: 'Товар',
    title: 'Тестовый товар',
    price: null,
    minimum_price: '250',
    unit: 'шт',
  });

  assert.equal(createdData.retailPrice.toString(), '250');
});

test('тип позиции Работа распознаётся как услуга', async () => {
  const { DataTransferService } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  let serviceCreated = false;
  const tx = {
    service: {
      findMany: async () => [],
      create: async ({ data }) => {
        serviceCreated = true;
        return { id: 'service-2', ...data };
      },
    },
    dataTransferEntityLink: { create: async ({ data }) => data },
  };
  const service = new DataTransferService({}, { log: async () => undefined });
  await service.importCatalogRow(tx, 'batch-1', 'row-2', {
    item_type: 'Работа',
    title: 'Консультация',
    price: '500',
  });
  assert.equal(serviceCreated, true);
});

test('одноимённые услуги из разных строк не объединяются молча', async () => {
  const { DataTransferService } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  let savedRows = [];
  const now = new Date('2026-07-28T08:00:00.000Z');
  const prisma = {
    dataTransferBatch: { findUnique: async () => null },
    dataTransferRow: { findMany: async () => [] },
    service: { findMany: async () => [] },
    $transaction: async (callback) => callback({
      dataTransferBatch: {
        create: async ({ data }) => ({ id: 'batch-1', ...data, createdAt: now, updatedAt: now, startedAt: null }),
        findUniqueOrThrow: async () => ({
          id: 'batch-1',
          sourceSystem: 'Проверка',
          kind: 'catalog',
          originalFileName: 'services.xlsx',
          fileChecksum: 'a'.repeat(64),
          status: 'PREVIEWED',
          totalRows: 2,
          readyRows: 0,
          importedRows: 0,
          skippedRows: 2,
          failedRows: 0,
          startedAt: null,
          completedAt: null,
          rolledBackAt: null,
          errorSummary: null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
          fieldMappings: [],
        }),
      },
      dataTransferEntityLink: { deleteMany: async () => undefined },
      dataTransferRow: {
        deleteMany: async () => undefined,
        createMany: async ({ data }) => { savedRows = data; },
      },
      dataTransferFieldMapping: {
        deleteMany: async () => undefined,
        createMany: async () => undefined,
      },
    }),
  };
  const service = new DataTransferService(prisma, { log: async () => undefined });
  await service.preview({
    kind: 'catalog',
    sourceSystem: 'Проверка',
    fileName: 'services.xlsx',
    fileChecksum: 'a'.repeat(64),
    rows: [
      { rowNumber: 5, data: { name: 'Кастрация', type: 'Услуга', category: 'Кошки' } },
      { rowNumber: 6, data: { name: 'Кастрация', type: 'Услуга', category: 'Собаки' } },
    ],
    mappings: [
      { sourceColumn: 'name', targetField: 'title' },
      { sourceColumn: 'type', targetField: 'item_type' },
      { sourceColumn: 'category', targetField: 'category' },
    ],
  }, { id: 'director-1', permissions: ['*'] });

  assert.equal(savedRows.length, 2);
  assert.ok(savedRows.every((row) => row.status === 'SKIPPED'));
  assert.ok(savedRows.every((row) => /несколько услуг с таким названием/i.test(row.error)));
});

test('большой файл сохраняется партиями и не превышает лимит PostgreSQL', async () => {
  const { DataTransferService } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  const sizes = [];
  const now = new Date('2026-07-28T08:00:00.000Z');
  let batch;
  let transactionOptions;
  const prisma = {
    dataTransferBatch: { findUnique: async () => null },
    dataTransferRow: { findMany: async () => [] },
    service: { findMany: async () => [] },
    product: { findMany: async () => [] },
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback({
        dataTransferBatch: {
          create: async ({ data }) => {
            batch = { id: 'batch-large', ...data, createdAt: now, updatedAt: now, startedAt: null };
            return batch;
          },
          findUniqueOrThrow: async () => ({ ...batch, fieldMappings: [] }),
        },
        dataTransferEntityLink: { deleteMany: async () => undefined },
        dataTransferRow: {
          deleteMany: async () => undefined,
          createMany: async ({ data }) => { sizes.push(data.length); return { count: data.length }; },
        },
        dataTransferFieldMapping: { deleteMany: async () => undefined, createMany: async () => undefined },
      });
    },
  };
  const service = new DataTransferService(prisma, { log: async () => undefined });
  const rows = Array.from({ length: 1_201 }, (_, index) => ({ rowNumber: index + 2, data: { title: `Товар ${index + 1}` } }));
  const result = await service.preview({
    kind: 'catalog', sourceSystem: 'Проверка', fileName: 'catalog.xlsx', fileChecksum: 'b'.repeat(64), rows,
    mappings: [{ sourceColumn: 'title', targetField: 'title' }],
  }, { id: 'director', permissions: ['*'] });

  assert.equal(result.totalRows, 1_201);
  assert.equal(sizes.reduce((sum, size) => sum + size, 0), 1_201);
  assert.ok(sizes.length >= 3);
  assert.ok(sizes.every((size) => size <= 500));
  assert.deepEqual(transactionOptions, { maxWait: 10_000, timeout: 60_000 });
});

test('контрольный отчёт нельзя записать в клиническую базу', async () => {
  const { DataTransferService } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  const service = new DataTransferService({}, { log: async () => undefined });
  await assert.rejects(
    service.preview({
      kind: 'clients', sourceSystem: 'Проверка', fileName: 'Проверка-клиентов-и-пациентов.xlsx', fileChecksum: 'c'.repeat(64),
      rows: [{ rowNumber: 2, data: { owner: 'Иванов' } }], mappings: [{ sourceColumn: 'owner', targetField: 'owner_name' }],
    }, { id: 'director', permissions: ['*'] }),
    /контрольный отч[её]т/i,
  );
});

test('сводка отличает владельцев от строк пациентов в одном файле', () => {
  const { countSourceEntitiesByType } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  const counts = countSourceEntitiesByType('clients', [
    { owner_source_id: 'owner-1', animal_source_id: 'animal-1' },
    { owner_source_id: 'owner-1', animal_source_id: 'animal-2' },
    { owner_source_id: 'owner-2', animal_source_id: null },
  ]);
  assert.deepEqual(counts, { owners: 2, animals: 2 });
});
