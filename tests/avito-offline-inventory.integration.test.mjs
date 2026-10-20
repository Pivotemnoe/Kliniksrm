import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { avitoFixture } from './helpers/avito-fixture.mjs';

test('Avito inventory and drafts survive external disconnection and a service restart', { skip: !process.env.AVITO_QA_DATABASE_URL }, async t => {
  const f = await avitoFixture(); const { prisma, api, service, editor, actorId } = f;
  const originalSelf = api.self.bind(api); const originalItems = api.ownListings.bind(api);
  const drafts = []; let networkCalls = 0;
  const disconnect = () => { api.self = api.ownListings = async () => { networkCalls++; throw Error('synthetic internet disconnected'); }; };
  await prisma.avitoListingSnapshot.deleteMany({ where: { integrationId: f.integration.id } });
  try {
    await t.test('the initial local view does not call Avito even without a snapshot', async () => {
      disconnect(); const result = await service.savedListings();
      assert.equal(result.source, 'EMPTY'); assert.deepEqual(result.items, []); assert.equal(networkCalls, 0);
    });
    await t.test('an authenticated refresh persists the inventory on the CRM database', async () => {
      api.self = originalSelf; api.ownListings = originalItems;
      const result = await service.ownListings();
      assert.equal(result.source, 'AVITO'); assert.equal(result.items.length, 3);
      assert.deepEqual((await service.savedListings()).items, result.items);
      assert.equal(await prisma.avitoListingSnapshot.count({ where: { integrationId: f.integration.id } }), 1);
    });
    await t.test('a restarted service reads the same saved inventory with all external calls failing', async () => {
      disconnect(); networkCalls = 0;
      const restarted = new service.constructor(prisma, f.modules, api, f.audit, f.crm, f.model);
      const result = await restarted.savedListings();
      assert.equal(result.source, 'SAVED'); assert.equal(result.items.length, 3); assert.equal(networkCalls, 0);
    });
    await t.test('a draft can be created from a saved listing, edited and reopened without internet', async () => {
      networkCalls = 0;
      let draft = await editor.create({ clientKey: randomUUID(), direction: 'CLINIC', sourceListingId: '101' }, actorId); drafts.push(draft.id);
      assert.equal(draft.sourceListingId, '101');
      draft = await editor.save(draft.id, { version: draft.version, content: { ...draft.content, title: 'Черновик без интернета', description: 'Текст сохранён на сервере клиники.' } }, actorId);
      assert.equal((await editor.get(draft.id)).content.description, 'Текст сохранён на сервере клиники.');
      assert.equal(networkCalls, 0); assert.equal(api.sent.length, 0);
    });
    await t.test('a failed manual refresh keeps the snapshot and marks it as saved data', async () => {
      const before = await service.savedListings();
      const result = await service.ownListings();
      assert.equal(result.source, 'SAVED'); assert.ok(result.refreshError); assert.deepEqual(result.items, before.items);
      assert.equal(result.capturedAt.toISOString(), before.capturedAt.toISOString());
    });
    await t.test('a changed account cannot see or overwrite another account snapshot', async () => {
      await prisma.avitoIntegration.update({ where: { id: f.integration.id }, data: { accountId: '900003' } });
      const saved = await service.savedListings(); assert.equal(saved.source, 'EMPTY'); assert.deepEqual(saved.items, []);
      api.self = originalSelf; api.ownListings = originalItems;
      await assert.rejects(() => service.ownListings(), /другому профилю/);
      const row = await prisma.avitoListingSnapshot.findFirstOrThrow({ where: { integrationId: f.integration.id } });
      assert.equal(row.accountId, '900001');
    });
  } finally {
    await prisma.avitoIntegration.update({ where: { id: f.integration.id }, data: { accountId: '900001' } });
    await prisma.avitoListingSnapshot.deleteMany({ where: { integrationId: f.integration.id } });
    await prisma.avitoListingDraftRevision.deleteMany({ where: { draftId: { in: drafts } } });
    await prisma.avitoListingDraft.deleteMany({ where: { id: { in: drafts } } });
    await prisma.$disconnect();
  }
});
