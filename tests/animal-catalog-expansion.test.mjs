import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildAnimalCatalog, extendAnimalCatalog, normalizeBreed } = require('../prisma/animal-catalog.cjs');
const data = require('../prisma/data/animal-breeds-20260927.json');

test('expanded catalog keeps species boundaries, source provenance and normalized unique options', () => {
  const catalog = buildAnimalCatalog();
  for (const species of catalog) {
    assert.equal(new Set(species.breeds.map(normalizeBreed)).size, species.breeds.length, species.code);
    assert.ok(species.breeds.every((title) => title.trim() === title && title.length > 1 && title.length < 150));
  }
  const dog = catalog.find((s) => s.code === 'dog');
  assert.ok(dog.breeds.length > 500);
  assert.ok(dog.breeds.includes('Мальтипу'));
  assert.ok(dog.breeds.includes('Бельгийская овчарка лакенуа'));
  assert.ok(!dog.breeds.includes('Као-мани'));
  assert.ok(catalog.find((s) => s.code === 'cat').breeds.includes('Као-мани'));
  for (const group of data.groups) assert.match(data.sources[group.source], /^https:\/\//);
});

test('catalog update is additive, dry-run is read-only, repeated application adds nothing', async () => {
  let nextId = 1;
  const species = buildAnimalCatalog().map((s) => ({ id: s.code, code: s.code }));
  let breeds = [{ id: 'legacy', speciesId: 'dog', title: 'Особая порода со слов владельца', sortOrder: 0 }];
  let mutations = 0;
  const tx = {
    animalSpecies: { findUnique: async ({ where }) => ({ ...species.find((s) => s.code === where.code), breeds: breeds.filter((b) => b.speciesId === where.code).map((b) => ({ ...b })) }) },
    animalBreed: {
      createMany: async ({ data }) => { mutations++; breeds.push(...data.map((b) => ({ ...b, id: String(nextId++) }))); },
      findMany: async ({ where }) => breeds.filter((b) => b.speciesId === where.speciesId).map((b) => ({ ...b })),
      update: async ({ where, data }) => { mutations++; assert.deepEqual(Object.keys(data), ['sortOrder']); Object.assign(breeds.find((b) => b.id === where.id), data); },
    },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  await extendAnimalCatalog(prisma);
  assert.equal(mutations, 0);
  const first = await extendAnimalCatalog(prisma, { apply: true });
  assert.ok(first.find((s) => s.code === 'dog').missing > 500);
  assert.equal(breeds.find((b) => b.id === 'legacy').title, 'Особая порода со слов владельца');
  const count = breeds.length;
  mutations = 0;
  const second = await extendAnimalCatalog(prisma, { apply: true });
  assert.equal(breeds.length, count);
  assert.ok(second.every((s) => s.missing === 0));
  assert.equal(mutations, 0);
});
