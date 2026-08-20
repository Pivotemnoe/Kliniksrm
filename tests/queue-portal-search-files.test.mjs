import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('поиск ставит совпадение с начала имени выше совпадения внутри строки', () => {
  const require = createRequire(import.meta.url);
  const { rankSearchResults } = require(path.join(root, 'apps/api/dist/common/search-ranking.js'));
  const result = rankSearchResults([
    { title: 'Анна Бульварная' },
    { title: 'Бульдогова Мария' },
    { title: 'Школа Буль' },
  ], 'буль', (item) => [item.title]);
  assert.deepEqual(result.map((item) => item.title), ['Бульдогова Мария', 'Анна Бульварная', 'Школа Буль']);
});

test('очередь хранит кабинет рабочего компьютера на сервере, удалённо перепривязывает его и позволяет убрать запись', async () => {
  const [selector, page, card, controller, service, queueApi, settings, schema] = await Promise.all([
    read('apps/web/src/features/queue/QueueWorkstationRoomSelect.tsx'),
    read('apps/web/src/features/queue/QueuePage.tsx'),
    read('apps/web/src/features/queue/QueueCardPage.tsx'),
    read('apps/api/src/modules/queue/queue.controller.ts'),
    read('apps/api/src/modules/queue/queue.service.ts'),
    read('apps/web/src/features/queue/queue.api.ts'),
    read('apps/web/src/features/scheduling/ClinicResourcesPage.tsx'),
    read('prisma/schema.prisma'),
  ]);

  assert.match(selector, /localStorage\.setItem\(storageKey, created\)/);
  assert.match(selector, /Кабинет этого компьютера/);
  assert.match(selector, /Рабочее место:/);
  assert.match(selector, /Изменить привязку/);
  assert.match(schema, /model QueueWorkstation \{/);
  assert.match(queueApi, /\/v1\/queue\/workstations/);
  assert.match(controller, /listWorkstations/);
  assert.match(controller, /updateWorkstation/);
  assert.match(settings, /Рабочие компьютеры/);
  assert.match(settings, /можно перепривязать удалённо/);
  assert.match(page, /Удалить из очереди/);
  assert.match(card, /Удалить из очереди/);
  assert.match(controller, /dto\.deviceId/);
  assert.match(service, /employeeId: actorId/);
  assert.match(service, /roomId: workstationRoom\.id,[\s\S]*officeId: workstationRoom\.officeId/);
});

test('архив пациента имеет кнопку просмотра, а личные кабинеты получают и открывают файлы', async () => {
  const [archive, filesApi, localPortal, localController, gatewaySchema, gatewayController, publicPortal] = await Promise.all([
    read('apps/web/src/features/files/PatientDocumentArchive.tsx'),
    read('apps/web/src/features/files/files.api.ts'),
    read('apps/web/src/features/clientPortal/ClientPortalPage.tsx'),
    read('apps/api/src/modules/client-portal/client-portal.controller.ts'),
    read('apps/owner-gateway/prisma/schema.prisma'),
    read('apps/owner-gateway/src/portal.controller.ts'),
    read('apps/owner-gateway/public/app.js'),
  ]);

  assert.match(archive, />Открыть<\/Button>/);
  assert.match(filesApi, /export async function previewAttachment/);
  assert.match(localPortal, /getClientPortalFileUrl/);
  assert.match(localController, /@Get\(':token\/files\/:fileId'\)/);
  assert.match(gatewaySchema, /model PortalDocument \{/);
  assert.match(gatewayController, /@Get\('documents\/:sourceFileId'\)/);
  assert.match(publicPortal, />Открыть<\/a>/);
});

test('личный кабинет показывает расширенную медицинскую информацию без внутреннего комментария осмотра', async () => {
  const [snapshot, portalTypes, localPortal, publicPortal] = await Promise.all([
    read('apps/api/src/modules/client-portal/client-portal.service.ts'),
    read('apps/web/src/features/clientPortal/types.ts'),
    read('apps/web/src/features/clientPortal/ClientPortalPage.tsx'),
    read('apps/owner-gateway/public/app.js'),
  ]);
  const examSelect = snapshot.match(/exam: \{\s*select: \{([\s\S]*?)\}\s*,\s*\},\s*diagnoses:/)?.[1] ?? '';

  assert.match(examSelect, /purpose: true/);
  assert.match(examSelect, /temperatureC: true/);
  assert.doesNotMatch(examSelect, /comment: true/);
  assert.match(portalTypes, /files: PortalFile\[\]/);
  assert.match(localPortal, /История веса/);
  assert.match(publicPortal, /История веса/);
});

test('кнопка пациента возвращает в карточку его владельца, а поле манипуляций увеличено по высоте', async () => {
  const [animalCard, examTab] = await Promise.all([
    read('apps/web/src/features/animals/AnimalCardPage.tsx'),
    read('apps/web/src/features/visits/VisitExamTab.tsx'),
  ]);
  assert.match(animalCard, /navigate\(`\/owners\/\$\{animal\.ownerId\}`\)/);
  assert.match(examTab, /name="manipulations"[\s\S]*rows=\{10\}/);
  assert.match(examTab, /name="symptoms"[\s\S]*rows=\{4\}/);
  assert.match(examTab, /name="comment"[\s\S]*rows=\{2\}/);
});
