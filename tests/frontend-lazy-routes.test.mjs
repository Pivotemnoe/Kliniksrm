import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('экраны CRM загружаются по маршрутам, а не входят целиком в стартовый JS', async () => {
  const routes = await read('apps/web/src/app/routes.tsx');
  const lazyImports = routes.match(/\(\) => import\(/g) ?? [];

  assert.ok(lazyImports.length >= 45, `ожидалось не менее 45 ленивых экранов, найдено ${lazyImports.length}`);
  assert.doesNotMatch(routes, /^import \{ .*Page \} from '\.\.\/(?:features|pages)\//m);
  assert.match(routes, /import\('\.\.\/features\/hospital\/HospitalCardPage'\)/);
  assert.match(routes, /import\('\.\.\/features\/visits\/VisitCardPage'\)/);
  assert.match(routes, /import\('\.\.\/features\/stock\/StockPage'\)/);
  assert.match(routes, /import\('\.\.\/features\/documents\/DocumentTemplatesPage'\)/);
});

test('при медленной или оборванной сети пользователь видит загрузку и может повторить её', async () => {
  const [app, layout, boundary] = await Promise.all([
    read('apps/web/src/app/App.tsx'),
    read('apps/web/src/layouts/CrmLayout.tsx'),
    read('apps/web/src/app/RouteLoadBoundary.tsx'),
  ]);

  assert.match(app, /<RouteLoadBoundary fullScreen>/);
  assert.match(layout, /<RouteLoadBoundary resetKey=\{location\.pathname\}>/);
  assert.match(boundary, /Загружаем раздел…/);
  assert.match(boundary, /Повторить загрузку/);
  assert.match(boundary, /window\.location\.reload\(\)/);
});
