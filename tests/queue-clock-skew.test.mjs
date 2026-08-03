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
  assert.match(listPage, /refetchInterval/);
  assert.match(cardPage, /refetchInterval/);
  assert.doesNotMatch(listPage, /getQueueAcceptWaitSeconds/);
  assert.doesNotMatch(cardPage, /getQueueAcceptWaitSeconds/);
});
