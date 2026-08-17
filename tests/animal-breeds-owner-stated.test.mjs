import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('каталог содержит расширенные породы собак и кошек', async () => {
  const seed = await read('prisma/seed.cjs');

  for (const breed of ['Фокстерьер гладкошёрстный', 'Вельш-корги пемброк', 'Канадский сфинкс', 'Норвежская лесная']) {
    assert.match(seed, new RegExp(`'${breed}'`));
  }
});

test('породу можно записать со слов владельца без изменения реестра', async () => {
  const [catalogService, fields] = await Promise.all([
    read('apps/api/src/modules/animals/animal-catalog.service.ts'),
    read('apps/web/src/features/animals/AnimalCatalogFields.tsx'),
  ]);

  assert.match(catalogService, /Порода может быть внесена со слов владельца/);
  assert.doesNotMatch(catalogService, /Порода не относится к выбранному виду животного/);
  assert.match(fields, /Нет в реестре — указать со слов владельца/);
  assert.match(fields, /Укажите породу со слов владельца/);
});
