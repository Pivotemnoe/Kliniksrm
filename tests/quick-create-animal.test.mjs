import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('нового питомца можно создать для выбранного существующего владельца и сразу выбрать', async () => {
  const quickCreate = await read('apps/web/src/features/owners/QuickCreateAnimalButton.tsx');

  assert.match(quickCreate, /createOwnerAnimal\(selectedOwnerId, values\)/);
  assert.match(quickCreate, /Добавить питомца/);
  assert.match(quickCreate, /queryKey: \['owners', variables\.ownerId, 'animals'\]/);
  assert.match(quickCreate, /onCreated\(animal\)/);
  assert.match(quickCreate, /Питомец добавлен и выбран/);
});

test('быстрое добавление питомца доступно в очереди, записи и прямом создании приёма', async () => {
  const [queue, appointment, visit] = await Promise.all([
    read('apps/web/src/features/queue/QueueFormDrawer.tsx'),
    read('apps/web/src/features/appointments/AppointmentFormDrawer.tsx'),
    read('apps/web/src/features/visits/VisitFormDrawer.tsx'),
  ]);

  for (const source of [queue, appointment, visit]) {
    assert.match(source, /<QuickCreateAnimalButton/);
    assert.match(source, /setValue\('animalId', animal\.id, \{ shouldDirty: true, shouldValidate: true \}\)/);
  }

  assert.match(visit, /!sourceContext \? \(\s*<QuickCreateAnimalButton/);
});
