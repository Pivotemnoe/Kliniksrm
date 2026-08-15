import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('задержка очереди равна 15 секундам и рассчитывается на сервере', async () => {
  const [service, types] = await Promise.all([
    read('apps/api/src/modules/queue/queue.service.ts'),
    read('apps/web/src/features/queue/types.ts'),
  ]);

  assert.match(service, /QUEUE_ACCEPT_DELAY_MS = 15_000/);
  assert.match(service, /acceptWaitSeconds: resolveQueueAcceptWaitSeconds/);
  assert.match(service, /items\.map\(\(item\) => toQueueEntryResponse\(item, responseTime\)\)/);
  assert.match(types, /acceptWaitSeconds: number/);
});

test('рассинхронизация часов браузера не превращает 15 секунд в 205', async () => {
  const { resolveQueueAcceptWaitSeconds } = await import('../apps/api/dist/modules/queue/queue.service.js');
  const serverNow = Date.parse('2026-08-03T10:00:00.000Z');
  const entry = {
    status: 'IN_PROGRESS',
    startedAt: new Date(serverNow),
    lastCalledAt: new Date(serverNow),
  };

  assert.equal(resolveQueueAcceptWaitSeconds(entry, serverNow), 15);
  assert.equal(resolveQueueAcceptWaitSeconds(entry, serverNow + 10_000), 5);
  assert.equal(resolveQueueAcceptWaitSeconds(entry, serverNow + 15_000), 0);
});

test('интерфейс не вычисляет задержку по часам рабочего компьютера', async () => {
  const [listPage, cardPage] = await Promise.all([
    read('apps/web/src/features/queue/QueuePage.tsx'),
    read('apps/web/src/features/queue/QueueCardPage.tsx'),
  ]);

  assert.match(listPage, /record\.acceptWaitSeconds/);
  assert.match(cardPage, /queueEntry\.acceptWaitSeconds/);
  assert.match(listPage, /window\.setInterval\(\(\) => void queueQuery\.refetch\(\), 1000\)/);
  assert.match(cardPage, /refetchInterval/);
  assert.doesNotMatch(listPage, /getQueueAcceptWaitSeconds/);
  assert.doesNotMatch(cardPage, /getQueueAcceptWaitSeconds/);
});

test('клиентский экран очереди остаётся двухколоночным на телевизоре и не показывает техническое пустое состояние', async () => {
  const [page, styles] = await Promise.all([
    read('apps/web/src/features/queue/QueueTvPage.tsx'),
    read('apps/web/src/styles.css'),
  ]);

  assert.match(page, />Ожидайте</);
  assert.match(page, />Вызов в кабинет</);
  assert.match(page, /onClick=\{\(\) => void enableSound\(\)\}/);
  assert.doesNotMatch(page, /Сейчас в очереди никого нет/);
  assert.doesNotMatch(page, /Сейчас никого не вызывают/);
  assert.doesNotMatch(page, /Звук включён|Звук выключен|Проверить звук|Включить звук/);
  assert.doesNotMatch(page, /Срочный приём|Ожидайте вызова|Подойдите на приём|врач /);
  assert.match(page, /called && item\.roomName/);
  assert.match(styles, /\.queue-tv-screen\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 600px\) and \(orientation: portrait\)[\s\S]*?\.queue-tv-screen\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
