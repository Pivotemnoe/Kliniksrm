import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('поиск считает е и ё одной буквой и сохраняет ранжирование по началу названия', () => {
  const { rankSearchResults, russianSearchVariants } = require('../apps/api/dist/common/search-ranking.js');

  assert.ok(russianSearchVariants('Семён').includes('Семен'));
  assert.ok(russianSearchVariants('Алёна').includes('Алена'));
  assert.deepEqual(
    rankSearchResults([{ title: 'Поливитамин' }, { title: 'Ёловая мазь' }], 'ел', (item) => [item.title]),
    [{ title: 'Ёловая мазь' }, { title: 'Поливитамин' }],
  );
});

test('единая русская нормализация применяется во всех списковых поисках CRM', async () => {
  const paths = [
    'animals/animals.service.ts',
    'appointments/appointments.service.ts',
    'billing/billing.service.ts',
    'files/files.service.ts',
    'hospital/hospital.service.ts',
    'laboratory/laboratory.service.ts',
    'medical-phrases/medical-phrases.service.ts',
    'news/news.service.ts',
    'online-requests/online-requests.service.ts',
    'owners/owners.service.ts',
    'queue/queue.service.ts',
    'sales/sales.service.ts',
    'stock/stock-documents.service.ts',
    'stock/stock.service.ts',
    'store/store.service.ts',
    'tasks/tasks.service.ts',
    'visits/visits.service.ts',
  ];

  for (const relativePath of paths) {
    const source = await read(`apps/api/src/modules/${relativePath}`);
    assert.match(source, /withRussianSearchVariants/, `${relativePath} должен учитывать е и ё`);
  }
});

test('список владельцев показывает последний неотменённый приём', async () => {
  const [service, page, types] = await Promise.all([
    read('apps/api/src/modules/owners/owners.service.ts'),
    read('apps/web/src/features/owners/OwnersPage.tsx'),
    read('apps/web/src/features/owners/types.ts'),
  ]);

  assert.match(service, /visits:\s*\{[\s\S]*status: \{ not: 'CANCELLED' \}[\s\S]*orderBy: \{ startedAt: 'desc' \}[\s\S]*take: 1/);
  assert.match(service, /lastVisitAt: visits\[0\]\?\.startedAt \?\? null/);
  assert.match(page, /dataIndex: 'lastVisitAt'/);
  assert.match(page, /render: formatDateTime/);
  assert.match(types, /lastVisitAt\?: string \| null/);
});

test('инвентаризация ищет весь каталог и разрешает неизвестную приходную цену', async () => {
  const [page, service] = await Promise.all([
    read('apps/web/src/features/stock/StockOperationsPage.tsx'),
    read('apps/api/src/modules/stock/stock-documents.service.ts'),
  ]);

  assert.match(page, /setBatchSearch\(value\);\s*setProductSearch\(value\);/);
  assert.match(page, /search: deferredProductSearch \|\| undefined/);
  assert.doesNotMatch(page, /listProducts\(\{ warehouseId, productId: initialProductId/);
  assert.match(page, /unitCost: getLatestKnownPurchasePrice\(product\)/);
  assert.match(page, /name=\{\[field\.name, 'unitCost'\]\}[\s\S]*?<InputNumber min=\{0\}/);
  assert.doesNotMatch(page, /required: true, message: 'Укажите приходную цену'/);
  assert.match(service, /productsWithoutCost/);
  assert.match(service, /latestCostByProduct\.get\(item\.productId\) \?\? 0/);
});

test('широкие складские таблицы имеют компактные фиксированные колонки и заметную липкую прокрутку', async () => {
  const [page, styles] = await Promise.all([
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/web/src/styles.css'),
  ]);

  assert.match(page, /title: 'Название'[\s\S]*?width: 210, ellipsis: \{ showTitle: true \}/);
  assert.match(page, /title: 'Категория'[\s\S]*?width: 160, ellipsis: \{ showTitle: true \}/);
  assert.match(page, /StockTable query=\{productsQuery\} columns=\{columns\} scrollX=\{1530\}/);
  assert.match(page, /tableLayout=\{typeof scrollX === 'number' \? 'fixed' : undefined\}/);
  assert.match(styles, /\.table-top-scroll \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(styles, /\.table-top-scroll::-webkit-scrollbar-thumb \{[\s\S]*?background: #718399;/);
  assert.match(styles, /scrollbar-color: #718399 #eef2f6/);
  assert.match(styles, /\.stock-catalog-table \.stock-nowrap \{[\s\S]*?white-space: nowrap;/);
});
