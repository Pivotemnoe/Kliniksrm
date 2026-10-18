import assert from 'node:assert/strict';
import test from 'node:test';
import { tsImport } from 'tsx/esm/api';

const { queueClinicReply, readQueuedReplies, flushQueuedReplies, retryQueuedReply } = await tsImport('../apps/web/src/features/onlineRequests/conversationOutbox.ts', import.meta.url);

function browserState() {
  const data = new Map();
  const sessionStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
  const window = new EventTarget();
  window.sessionStorage = sessionStorage;
  globalThis.window = window;
  globalThis.sessionStorage = sessionStorage;
  return { data };
}

test('reply remains in tab during outage and retries with the same idempotency key', async () => {
  browserState();
  const calls = [];
  let available = false;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return new Response(JSON.stringify(available ? { id: 'server-job' } : { message: 'unavailable' }), {
      status: available ? 200 : 503,
      headers: { 'content-type': 'application/json' },
    });
  };
  const queued = queueClinicReply('employee-1', 'request-1', 'Здравствуйте, мы уточним время.');
  await flushQueuedReplies('employee-1');
  assert.equal(readQueuedReplies('employee-1').length, 1);
  available = true;
  await flushQueuedReplies('employee-1');
  assert.equal(readQueuedReplies('employee-1').length, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].clientKey, queued.clientKey);
  assert.equal(calls[1].clientKey, queued.clientKey);
});

test('business rejection is not retried until employee reviews it', async () => {
  browserState();
  let calls = 0;
  let rejected = true;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(rejected ? { message: 'Заявку обрабатывает другой сотрудник' } : { id: 'server-job' }), {
      status: rejected ? 409 : 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const queued = queueClinicReply('employee-2', 'request-2', 'Проверка.');
  await flushQueuedReplies('employee-2');
  assert.equal(readQueuedReplies('employee-2')[0].state, 'needs-review');
  await flushQueuedReplies('employee-2');
  assert.equal(calls, 1);
  rejected = false;
  retryQueuedReply('employee-2', queued.clientKey);
  await flushQueuedReplies('employee-2');
  assert.equal(calls, 2);
  assert.equal(readQueuedReplies('employee-2').length, 0);
});
