const base = require('./data/animal-catalog-base.json');
const expansion = require('./data/animal-breeds-20260927.json');

function normalizeBreed(value) {
  return value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]/g, '');
}

function buildAnimalCatalog() {
  return base.map((species) => {
    const breeds = [...species.breeds];
    const seen = new Set(breeds.map(normalizeBreed));
    for (const group of expansion.groups.filter((item) => item.species === species.code)) {
      for (const title of group.titles) {
        if (!seen.has(normalizeBreed(title))) {
          breeds.push(title);
          seen.add(normalizeBreed(title));
        }
      }
    }
    const pinned = ['Не указана', 'Беспородная', 'Метис'];
    breeds.sort((a, b) => {
      const rank = (name) => pinned.includes(name) ? pinned.indexOf(name) : pinned.length;
      return rank(a) - rank(b) || a.localeCompare(b, 'ru');
    });
    return { ...species, breeds };
  });
}

// Additive update only: never edit animal cards, delete breeds, rename entries,
// or reset unrelated production settings through the full seed.
async function extendAnimalCatalog(prisma, { apply = false } = {}) {
  const catalog = buildAnimalCatalog();
  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const item of catalog) {
      const species = await tx.animalSpecies.findUnique({ where: { code: item.code }, include: { breeds: true } });
      if (!species) throw new Error(`Missing species: ${item.code}`);
      const known = new Set(species.breeds.map((breed) => normalizeBreed(breed.title)));
      const missing = item.breeds.filter((title) => !known.has(normalizeBreed(title)));
      if (apply && missing.length) {
        await tx.animalBreed.createMany({ data: missing.map((title) => ({ speciesId: species.id, title, sortOrder: 1000 })), skipDuplicates: true });
      }
      if (apply) {
        // Existing titles and IDs stay intact; only display order changes.
        const all = await tx.animalBreed.findMany({ where: { speciesId: species.id } });
        const pinned = ['Не указана', 'Беспородная', 'Метис'];
        all.sort((a, b) => {
          const rank = (name) => pinned.includes(name) ? pinned.indexOf(name) : pinned.length;
          return rank(a.title) - rank(b.title) || a.title.localeCompare(b.title, 'ru');
        });
        for (const [sortOrder, breed] of all.entries()) {
          if (breed.sortOrder !== sortOrder) await tx.animalBreed.update({ where: { id: breed.id }, data: { sortOrder } });
        }
      }
      results.push({ code: item.code, before: species.breeds.length, missing: missing.length, after: species.breeds.length + (apply ? missing.length : 0) });
    }
    return results;
  }, { timeout: 60000 });
}
module.exports = { buildAnimalCatalog, extendAnimalCatalog, normalizeBreed };
