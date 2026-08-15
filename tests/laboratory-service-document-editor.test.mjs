import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('клинический сотрудник связывает услугу и документ из приёма или лаборатории', async () => {
  const [page, visitTab, laboratoryController, documentsController, access, seed] = await Promise.all([
    read('apps/web/src/features/laboratory/LaboratoryPage.tsx'),
    read('apps/web/src/features/visits/VisitLaboratoryTab.tsx'),
    read('apps/api/src/modules/laboratory/laboratory.controller.ts'),
    read('apps/api/src/modules/documents/documents.controller.ts'),
    read('apps/web/src/auth/access.ts'),
    read('prisma/seed.cjs'),
  ]);

  assert.match(page, /Связать услугу и документ/);
  assert.match(page, /Название в лаборатории/);
  assert.match(page, /name="serviceId"/);
  assert.match(page, /name="documentTemplateId"/);
  assert.match(page, /Название связи, услугу и документ можно изменить в любой момент/);
  assert.match(visitTab, /<LaboratoryTestEditorDrawer/);
  assert.match(visitTab, /Связать услугу и документ/);
  assert.match(laboratoryController, /@RequireAnyPermissions\('laboratory\.read', 'laboratory\.manage', 'visits\.manage'\)/);
  assert.match(documentsController, /@RequireAnyPermissions\('documents\.read', 'laboratory\.read', 'laboratory\.manage', 'visits\.manage'\)/);
  assert.match(access, /path: '\/laboratory', anyOf: \['laboratory\.read', 'laboratory\.manage', 'visits\.manage'\]/);
  assert.match(seed, /'assistant',[\s\S]*?'laboratory\.read'/);
});

test('редактор не пытается автоматически угадать связь по названию документа', async () => {
  const migrations = await read('prisma/migrations/20260814000100_laboratory_test_document_forms/migration.sql');

  assert.doesNotMatch(migrations, /INSERT INTO "LaboratoryTest"|UPDATE "LaboratoryTest"/i);
});
