import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('архив пациента сохраняет историю и блокирует новые рабочие операции', async () => {
  const [service, scheduling, appointment, owners, portal] = await Promise.all([
    read('apps/api/src/modules/animals/animals.service.ts'),
    read('apps/api/src/modules/scheduling/scheduling.service.ts'),
    read('apps/api/src/modules/appointments/appointments.service.ts'),
    read('apps/api/src/modules/owners/owners.service.ts'),
    read('apps/api/src/modules/client-portal/client-portal.service.ts'),
  ]);

  assert.doesNotMatch(service, /tx\.animal\.delete/);
  assert.match(service, /linkedRecords: animal\._count/);
  assert.match(service, /незавершённый приём/);
  assert.match(service, /активный стационар/);
  assert.match(service, /активная очередь/);
  assert.match(service, /действующая запись на приём/);
  assert.match(service, /notificationOutbox\.updateMany/);
  assert.match(scheduling, /animal\.archivedAt && !options\?\.allowArchived/);
  assert.match(appointment, /allowArchived: Boolean\(existing && animalId === existing\.animalId\)/);
  assert.match(owners, /includeArchived = false/);
  assert.match(portal, /animals: \{\s+where: \{ archivedAt: null \}/);
});

test('интерфейс показывает архив, причину и восстановление', async () => {
  const [modal, card, ownerTab, api] = await Promise.all([
    read('apps/web/src/features/animals/AnimalArchiveModal.tsx'),
    read('apps/web/src/features/animals/AnimalCardPage.tsx'),
    read('apps/web/src/features/owners/OwnerAnimalsTab.tsx'),
    read('apps/web/src/features/animals/animals.api.ts'),
  ]);

  assert.match(modal, /Животное умерло/);
  assert.match(modal, /Карточка создана ошибочно/);
  assert.match(modal, /Медицинская и финансовая история сохранится/);
  assert.match(card, /readOnly=\{Boolean\(animal\.archivedAt\)\}/);
  assert.match(card, /Восстановить пациента/);
  assert.match(ownerTab, /Показать архив/);
  assert.match(api, /export function archiveAnimal/);
  assert.match(api, /export function restoreAnimal/);
});
