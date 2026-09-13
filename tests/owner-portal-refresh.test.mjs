import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { queueOwnerRefreshForChange } = require('../apps/api/dist/modules/client-portal/owner-refresh.js');
const { OwnerGatewaySnapshotSyncService } = require('../apps/api/dist/modules/notifications/owner-gateway-snapshot-sync.service.js');

function database({ access = 'ENABLED', existing = null, claim = 1 } = {}) {
  const created = []; const queries = [];
  return { created, queries,
    clientPortalAccess: { findUnique: async () => ({ status: access }) },
    laboratoryOrderItem: { findUnique: async () => ({ order: { visit: { ownerId: 'owner-a' } } }) },
    backgroundJob: {
      findFirst: async (query) => { queries.push(query); return existing; },
      create: async (query) => { created.push(query.data); return { id: 'job' }; },
      updateMany: async () => ({ count: claim }),
    },
  };
}
test('изменение лабораторного показателя ставит обновление его владельца без ручной публикации', async () => {
  const db = database();
  await queueOwnerRefreshForChange(db, { action: 'lab.item.update', entityType: 'LaboratoryOrderItem', entityId: 'item' });
  assert.equal(db.created[0].payload.ownerId, 'owner-a');
  assert.equal(db.queries[0].where.status, 'PENDING');
});
test('обновление снимка не запускает само себя, отключённый кабинет не получает новые задачи', async () => {
  const db = database({ access: 'DISABLED' });
  await queueOwnerRefreshForChange(db, { action: 'client_portal.snapshot_sync_automatic', entityType: 'Owner', entityId: 'owner-a' });
  await queueOwnerRefreshForChange(db, { action: 'owner.update', entityType: 'Owner', entityId: 'owner-a' });
  assert.equal(db.created.length, 0); assert.equal(db.queries.length, 0);
});
test('ожидающая задача объединяет изменения, начавшая выполняться не поглощает новое изменение', async () => {
  for (const claim of [0, 1]) {
    const db = database({ existing: { id: 'pending' }, claim });
    await queueOwnerRefreshForChange(db, { action: 'owner.update', entityType: 'Owner', entityId: 'owner-a' });
    assert.equal(db.created.length, claim ? 0 : 1);
  }
});
test('объединение владельцев обновляет целевого и ставит отзыв старого доступа', async () => {
  const db = database();
  await queueOwnerRefreshForChange(db, { action: 'owner.merge', entityType: 'Owner', entityId: 'owner-a', metadata: { sourceOwnerId: 'old-owner' } });
  assert.equal(db.created.length, 2);
  assert.equal(db.created[1].payload.ownerId, 'old-owner');
  assert.equal(db.created[1].payload.revokeAccess, true);
});
test('очередь отзывает старый доступ, даже когда исходный владелец уже удалён из CRM', async () => {
  const updated = []; const revoked = [];
  const db = { backgroundJob: { updateMany: async () => ({ count: 1 }), update: async (input) => updated.push(input) } };
  const sync = new OwnerGatewaySnapshotSyncService(db, { revokeAccess: async (id) => { revoked.push(id); return 'synced'; } }, { log: async () => {} });
  await sync.processJob('job', { ownerId: 'old-owner', revokeAccess: true, attempts: 0, actorId: null, visitId: null, visitStatus: null });
  assert.deepEqual(revoked, ['old-owner']);
  assert.equal(updated[0].data.status, 'DONE');
});

test('периодическая сверка не повторяется на каждом проходе очереди и не мешает обработке при ошибке', async () => {
  const previousUrl = process.env.OWNER_GATEWAY_URL; const previousSecret = process.env.OWNER_GATEWAY_SYNC_SECRET;
  process.env.OWNER_GATEWAY_URL = 'https://example.invalid'; process.env.OWNER_GATEWAY_SYNC_SECRET = 'test-only';
  let reconciliations = 0; let queueReads = 0;
  try {
    const sync = new OwnerGatewaySnapshotSyncService({ backgroundJob: { findMany: async () => { queueReads++; return []; } } }, {}, {});
    sync.enqueueActivePortalRefreshes = async () => { reconciliations++; };
    await sync.syncNow(); await sync.syncNow();
    assert.equal(reconciliations, 1); assert.equal(queueReads, 2);
    sync.nextReconciliationAt = 0;
    sync.enqueueActivePortalRefreshes = async () => { throw new Error('Temporary DB failure'); };
    await sync.syncNow();
    assert.equal(queueReads, 3);
  } finally {
    if (previousUrl === undefined) delete process.env.OWNER_GATEWAY_URL; else process.env.OWNER_GATEWAY_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.OWNER_GATEWAY_SYNC_SECRET; else process.env.OWNER_GATEWAY_SYNC_SECRET = previousSecret;
  }
});
