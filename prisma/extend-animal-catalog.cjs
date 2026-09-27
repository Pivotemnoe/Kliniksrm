const { PrismaClient } = require('@prisma/client');
const { extendAnimalCatalog } = require('./animal-catalog.cjs');
const prisma = new PrismaClient();
const args = process.argv.slice(2);
if (args.some((arg) => !['--apply', '--dry-run'].includes(arg)) || args.length > 1) {
  console.error('Usage: node prisma/extend-animal-catalog.cjs [--dry-run|--apply]');
  process.exitCode = 1;
} else {
  extendAnimalCatalog(prisma, { apply: args.includes('--apply') })
    .then((result) => console.log(JSON.stringify({ applied: args.includes('--apply'), result })))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
