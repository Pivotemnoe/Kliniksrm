import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolvePortalActivation } = require('../apps/api/dist/modules/notifications/portal-activation.js');
const { NotificationsService } = require('../apps/api/dist/modules/notifications/notifications.service.js');
const { NotificationsController } = require('../apps/api/dist/modules/notifications/notifications.controller.js');
const { OwnerGatewayClient } = require('../apps/api/dist/modules/notifications/providers/owner-gateway.client.js');
const { PortalStatusesDto } = require('../apps/api/dist/modules/notifications/dto/portal-statuses.dto.js');
const { validateSync } = require('class-validator');
const access = (status, fields = {}) => ({ status, invitedAt: null, lastLoginAt: null, ...fields });

test('queue portal status requires an actual login, not an issued invitation or ENABLED flag', () => {
  for (const state of [null, access('INVITED'), access('ENABLED'), access('DISABLED')]) {
    assert.equal(resolvePortalActivation(state, true), 'NOT_ACTIVATED');
  }
  assert.equal(resolvePortalActivation(access('INVITED'), true, '2026-09-06T10:00:00Z'), 'ACTIVATED');
  assert.equal(resolvePortalActivation(access('ENABLED', { lastLoginAt: new Date() }), false), 'ACTIVATED');
  assert.equal(resolvePortalActivation(null, false), 'UNKNOWN');
  assert.equal(resolvePortalActivation(access('BLOCKED'), true, '2026-09-06T10:00:00Z'), 'BLOCKED');
  assert.equal(resolvePortalActivation(access('DISABLED', { invitedAt: new Date() }), true), 'SUSPENDED');
});

test('queue portal lookup is batched, owner-scoped and returns no invitation secrets', async () => {
  const ownerIds = ['first', 'second'];
  const prisma = { owner: { findMany: async (query) => {
    assert.deepEqual(query.where.id.in, ownerIds);
    return [{ id: 'first', portalAccess: access('INVITED') }, { id: 'second', portalAccess: null }];
  } } };
  let calls = 0;
  const gateway = { getCachedPortalStatistics: async () => {
    calls++;
    return { owners: [{ ownerId: 'first', activatedAt: '2026-09-06T10:00:00Z' }, { ownerId: 'unrequested', activatedAt: '2026-09-06T10:00:00Z' }] };
  } };
  const service = new NotificationsService(prisma, {}, {}, gateway);
  assert.deepEqual(await service.getPortalStatuses(ownerIds), { items: [
    { ownerId: 'first', status: 'ACTIVATED' }, { ownerId: 'second', status: 'NOT_ACTIVATED' },
  ] });
  assert.equal(calls, 1);
  gateway.getCachedPortalStatistics = async () => null;
  assert.deepEqual((await service.getPortalStatuses(ownerIds)).items.map((i) => i.status), ['UNKNOWN', 'UNKNOWN']);
});

test('queue gateway cache shares in-flight requests and recovers after a failed lookup', async () => {
  const client = new OwnerGatewayClient({}, {});
  let calls = 0;
  client.getPortalStatistics = async (timeout) => {
    assert.equal(timeout, 4000);
    calls++;
    return calls === 1 ? null : { owners: [], generatedAt: new Date().toISOString(), invitations: [] };
  };
  assert.deepEqual(await Promise.all([client.getCachedPortalStatistics(), client.getCachedPortalStatistics()]), [null, null]);
  await client.getCachedPortalStatistics();
  assert.equal(calls, 1);
  client.portalStatisticsCache.expiresAt = 0;
  assert.ok(await client.getCachedPortalStatistics());
  assert.equal(calls, 2);
});

test('portal status request validates UUIDs, duplicates and the 100-owner limit', () => {
  const dto = (ownerIds) => Object.assign(new PortalStatusesDto(), { ownerIds });
  const id = '10000000-0000-4000-8000-000000000001';
  assert.equal(validateSync(dto([id])).length, 0);
  for (const ids of [[], ['not-an-id'], [id, id], Array(101).fill(id)]) {
    assert.ok(validateSync(dto(ids)).length > 0);
  }
});

test('a doctor can prepare only a safe WEB invitation, without overriding an activated or disabled account', async () => {
  const calls = [];
  const controller = new NotificationsController({ createPortalInvite: (...args) => calls.push(args) });
  controller.createPortalInvite('owner', { channel: 'MAX', onlyIfNotActivated: false }, { id: 'doctor', permissions: ['owners.read', 'owners.manage'] });
  assert.deepEqual(calls[0], ['owner', { channel: 'WEB', onlyIfNotActivated: true }, 'doctor']);
  controller.createPortalInvite('owner', { channel: 'MAX' }, { id: 'director', permissions: ['*'] });
  assert.deepEqual(calls[1], ['owner', { channel: 'MAX' }, 'director']);
  const action = NotificationsController.prototype.createPortalInvite;
  assert.deepEqual(Reflect.getMetadata('requiredPermissions', action), ['owners.read']);
  assert.deepEqual(Reflect.getMetadata('requiredAnyPermissions', action), ['notifications.manage', 'owners.manage']);
  assert.deepEqual(Reflect.getMetadata('requiredPermissions', NotificationsController.prototype.updatePortalAccess), ['notifications.manage']);
});

for (const [label, local, gateway] of [
  ['activated', access('INVITED'), { activatedAt: '2026-09-06T10:00:00Z' }],
  ['blocked', access('BLOCKED'), {}],
  ['disabled', access('DISABLED', { invitedAt: new Date() }), {}],
  ['unavailable', null, null],
]) {
  test(`queue invitation does not write when portal is ${label}`, async () => {
    const prisma = {
      owner: { findUnique: async () => ({ id: 'owner', fullName: 'Test Owner' }) },
      clientPortalAccess: { findUnique: async () => local },
      $transaction: () => assert.fail('must not change access'),
    };
    const service = new NotificationsService(prisma, { log: () => assert.fail('must not log success') }, {}, { getStatus: async () => gateway });
    await assert.rejects(service.createPortalInvite('owner', { channel: 'WEB', onlyIfNotActivated: true }, 'doctor'));
  });
}

test('queue WEB invitation produces all three links and audits the actor without sending unsolicited messages', async () => {
  const logs = [];
  const owner = { id: 'owner', fullName: 'Test Owner', phone: null, email: null, telegramChatId: null, maxUserId: null };
  let written;
  const prisma = {
    owner: { findUnique: async () => owner },
    clientPortalAccess: { findUnique: async () => null },
    $transaction: async (callback) => callback({ clientPortalAccess: { upsert: async (query) => {
      written = query.create;
      return { id: 'access', ...written, owner };
    } } }),
  };
  const urls = { WEB: 'https://test.invalid/web', TELEGRAM: 'https://test.invalid/telegram', MAX: 'https://test.invalid/max' };
  const gateway = {
    getStatus: async () => ({ activatedAt: null }),
    syncInvitation: async (input) => {
      assert.equal(input.channel, 'WEB');
      assert.equal(input.ownerId, owner.id);
      assert.ok(input.token.length >= 32);
      return { status: 'synced', deliveryUrls: urls, deliveryUrl: urls.WEB, automaticDelivery: 'manual_required' };
    },
  };
  const service = new NotificationsService(prisma, { log: async (entry) => logs.push(entry) }, {}, gateway);
  const result = await service.createPortalInvite(owner.id, { channel: 'WEB', onlyIfNotActivated: true }, 'doctor');
  assert.deepEqual(result.deliveryUrls, urls);
  assert.equal(written.status, 'INVITED');
  assert.equal(written.inviteExpiresAt - written.invitedAt, 24 * 60 * 60 * 1000);
  assert.equal(logs[0].actorId, 'doctor');
  assert.equal(logs[0].action, 'client_portal.invite_create');
  assert.equal(logs[0].metadata.automaticDelivery, 'manual_required');
  assert.equal(JSON.stringify(logs).includes(result.inviteToken), false);
});
