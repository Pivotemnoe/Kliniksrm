import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {configureHotelGatewayQa, prepareHotelGatewayDatabase, hotelGatewayQaApp, hotelGatewayQaSecret} from './helpers/pet-hotel-gateway-qa.mjs';

const require = createRequire(import.meta.url);
const name = configureHotelGatewayQa();
await prepareHotelGatewayDatabase(name);

test('hotel delivery HTTP uses durable receipts, shared owner policy and an independent budget', {timeout: 45000}, async t => {
  const f = await hotelGatewayQaApp();
  t.after(() => f.close());
  const {MaxBotClient} = require('../apps/owner-gateway/dist/max-bot.client.js');
  const {OwnerNotificationService} = require('../apps/owner-gateway/dist/owner-notification.service.js');
  const {PetHotelDeliveryService} = require('../apps/owner-gateway/dist/pet-hotel/pet-hotel-delivery.service.js');
  const hotelDeliveries = f.app.get(PetHotelDeliveryService);
  const max = f.app.get(MaxBotClient), notifications = f.app.get(OwnerNotificationService);
  const attempts = [];
  let failOwner = false, failStaff = false, rejectStaff = false, held;
  max.sendMessage = async (recipient, text, destination) => {
    attempts.push({recipient, text, destination});
    if (failOwner) throw Error('Synthetic ambiguous transport response');
    return {messageId: 'owner-' + randomUUID()};
  };
  max.sendStaffMessage = async (recipient, text) => {
    attempts.push({recipient, text, staff: true});
    if (held) { held.started(); await held.promise; }
    if (rejectStaff) throw Object.assign(Error('Synthetic explicit rejection'), {maxRejected: true});
    if (failStaff) throw Error('Synthetic ambiguous transport response');
    return {messageId: 'staff-' + randomUUID()};
  };
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const ownerMax = String(BigInt('0x' + randomUUID().replaceAll('-', '').slice(0, 12)));
  const otherMax = String(BigInt(ownerMax) + 1n);
  await f.prisma.messengerBinding.create({data: {ownerId: f.ownerId, channel: 'MAX', externalUserId: ownerMax}});
  await f.prisma.ownerNotificationPreference.create({data: {ownerId: f.ownerId, quietStartMinute: 0, quietEndMinute: 0}});
  const owner = {recipientKind: 'OWNER', recipientId: f.ownerId, kind: 'PET_HOTEL_CHANGE', text: 'ТЕСТ: бронь гостиницы', expiresAt};
  const staff = {recipientKind: 'STAFF', recipientId: otherMax, kind: 'PET_HOTEL_CHANGE', text: 'ТЕСТ: новое размещение', expiresAt};
  const request = async (id, body, secret = hotelGatewayQaSecret) => {
    const response = await fetch(f.origin + '/internal/v1/pet-hotel/portal/deliveries/' + id, {
      method: 'POST', headers: {'content-type': 'application/json', ...(secret ? {'x-owner-gateway-secret': secret} : {})}, body: JSON.stringify(body),
    });
    return {status: response.status, data: await response.json()};
  };
  let ownerId, staffId;

  await t.test('internal authentication, UUID, hotel kind, recipient and expiry are enforced', async () => {
    assert.equal((await request(randomUUID(), owner, null)).status, 403);
    assert.equal((await request('not-a-uuid', owner)).status, 400);
    assert.equal((await request(randomUUID(), {...owner, kind: 'GROOMING_CHANGE'})).status, 400);
    assert.equal((await request(randomUUID(), {...staff, recipientId: 'unverified-address'})).status, 400);
    assert.equal((await request(randomUUID(), {...staff, expiresAt: '2027-02-31T10:00:00+03:00'})).status, 400);
    assert.equal((await request(randomUUID(), {...staff, text: ' '})).status, 400);
    assert.equal(attempts.length, 0);
  });

  await t.test('hotel delivery is off by default and does not depend on grooming/clinical flags', async () => {
    assert.equal((await request(randomUUID(), owner)).data.status, 'DISABLED');
    assert.equal((await request(randomUUID(), staff)).data.status, 'DISABLED');
    assert.equal(attempts.length, 0);
    process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED = 'true';
    process.env.GROOMING_CLIENT_NOTIFICATIONS_ENABLED = 'false';
    process.env.CLINIC_ASSISTANT_REMINDERS_ENABLED = 'false';
    process.env.PET_HOTEL_NOTIFICATION_DAILY_LIMIT = '10';
    ownerId = randomUUID();
    assert.equal((await request(ownerId, owner)).data.status, 'SENT');
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].recipient, ownerMax);
    assert.equal(attempts[0].destination, 'pet-hotel');
  });

  await t.test('owner replay survives expiry/disable and rejects a changed intent', async () => {
    const count = attempts.length;
    assert.equal((await request(ownerId, {expiresAt, text: owner.text, kind: owner.kind, recipientId: owner.recipientId, recipientKind: 'OWNER'})).data.status, 'SENT');
    assert.equal((await request(ownerId, {...owner, text: 'Изменённый текст'})).status, 409);
    process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED = 'false';
    assert.equal((await request(ownerId, owner)).data.status, 'SENT');
    assert.equal((await hotelDeliveries.deliver(ownerId, owner, new Date(Date.parse(expiresAt) + 1000))).status, 'SENT');
    assert.equal(attempts.length, count);
    process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED = 'true';
  });

  await t.test('staff replay is durable and cannot change the MAX recipient', async () => {
    staffId = randomUUID(); const count = attempts.length;
    assert.equal((await request(staffId, staff)).data.status, 'SENT');
    assert.equal((await request(staffId, staff)).data.status, 'SENT');
    assert.equal((await request(staffId, {...staff, recipientId: ownerMax})).status, 409);
    process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED = 'false';
    assert.equal((await request(staffId, staff)).data.status, 'SENT');
    assert.equal((await hotelDeliveries.deliver(staffId, staff, new Date(Date.parse(expiresAt) + 1000))).status, 'SENT');
    process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED = 'true';
    assert.equal(attempts.length, count + 1);
  });

  await t.test('uncertain OWNER and STAFF sends never repeat automatically; explicit rejection is terminal', async () => {
    for (const recipientKind of ['OWNER', 'STAFF']) {
      const body = recipientKind === 'OWNER' ? {...owner, kind: 'PET_HOTEL_REMINDER'} : {...staff, kind: 'PET_HOTEL_REMINDER'};
      const id = randomUUID(), count = attempts.length;
      failOwner = recipientKind === 'OWNER'; failStaff = recipientKind === 'STAFF';
      assert.equal((await request(id, body)).data.status, 'UNKNOWN');
      failOwner = false; failStaff = false;
      assert.equal((await request(id, body)).data.status, 'UNKNOWN');
      assert.equal(attempts.length, count + 1);
    }
    rejectStaff = true; const id = randomUUID(), count = attempts.length;
    assert.equal((await request(id, staff)).data.status, 'REJECTED');
    rejectStaff = false;
    assert.equal((await request(id, staff)).data.status, 'REJECTED');
    assert.equal(attempts.length, count + 1);
  });

  await t.test('one delivery ID cannot switch OWNER and STAFF after SENT or UNKNOWN', async () => {
    for (const first of ['OWNER', 'STAFF']) for (const uncertain of [false, true]) {
      const id = randomUUID(), count = attempts.length;
      failOwner = first === 'OWNER' && uncertain; failStaff = first === 'STAFF' && uncertain;
      const body = first === 'OWNER' ? owner : staff, changed = first === 'OWNER' ? staff : owner;
      assert.equal((await request(id, body)).data.status, uncertain ? 'UNKNOWN' : 'SENT');
      failOwner = false; failStaff = false;
      assert.equal((await request(id, changed)).status, 409);
      assert.equal((await request(id, body)).data.status, uncertain ? 'UNKNOWN' : 'SENT');
      assert.equal(attempts.length, count + 1);
    }
  });

  await t.test('concurrent cross-role claims and a role change during transport send only once', async () => {
    const id = randomUUID(), count = attempts.length;
    const results = await Promise.all([request(id, owner), request(id, staff)]);
    assert.deepEqual(results.map(x => x.status).sort(), [201, 409]);
    assert.equal(attempts.length, count + 1);
    let release, started;
    const active = new Promise(resolve => { started = resolve; });
    held = {started, promise: new Promise(resolve => { release = resolve; })};
    const activeId = randomUUID(), first = request(activeId, staff);
    try { await active; assert.equal((await request(activeId, owner)).status, 409); }
    finally { release(); }
    assert.equal((await first).data.status, 'SENT'); held = undefined;
    assert.equal(attempts.length, count + 2);
  });

  await t.test('pre-registry transport receipts preserve role and payload on first intent claim', async () => {
    const count = attempts.length;
    for (const [id, body, changed] of [[ownerId, owner, staff], [staffId, staff, owner]]) {
      await f.prisma.petHotelDeliveryIntent.delete({where: {id}});
      assert.equal((await request(id, changed)).status, 409);
      assert.equal((await request(id, {...body, text: 'Изменённая старая доставка'})).status, 409);
      assert.equal((await request(id, body)).data.status, 'SENT');
    }
    assert.equal(attempts.length, count);
  });

  await t.test('concurrent replay while transport is active returns SENDING without a second call', async () => {
    let release, started;
    const active = new Promise(resolve => { started = resolve; });
    held = {started, promise: new Promise(resolve => { release = resolve; })};
    const id = randomUUID(), count = attempts.length;
    const first = request(id, staff);
    try {
      await active;
      assert.equal((await request(id, staff)).data.status, 'SENDING');
    } finally { release(); }
    assert.equal((await first).data.status, 'SENT'); held = undefined;
    assert.equal((await request(id, staff)).data.status, 'SENT');
    assert.equal(attempts.length, count + 1);
  });

  await t.test('an interrupted SENDING receipt becomes UNKNOWN without sending again', async () => {
    const count = attempts.length;
    await f.prisma.petHotelStaffDelivery.update({where: {id: staffId}, data: {status: 'SENDING', attemptedAt: new Date(Date.now() - 70000)}});
    assert.equal((await request(staffId, staff)).data.status, 'UNKNOWN');
    await f.prisma.ownerNotificationDelivery.update({where: {id: ownerId}, data: {status: 'SENDING', attemptedAt: new Date(Date.now() - 70000)}});
    assert.equal((await request(ownerId, owner)).data.status, 'UNKNOWN');
    assert.equal(attempts.length, count);
  });

  await t.test('owner opt-out, quiet hours, unlinked MAX and expired intent are respected', async () => {
    const count = attempts.length, input = {...owner, recipientId: f.otherOwnerId};
    await f.prisma.ownerNotificationPreference.create({data: {ownerId: f.otherOwnerId, enabled: false, quietStartMinute: 0, quietEndMinute: 0}});
    assert.equal((await request(randomUUID(), input)).data.status, 'NO_CONSENT');
    await f.prisma.ownerNotificationPreference.update({where: {ownerId: f.otherOwnerId}, data: {enabled: true}});
    assert.equal((await request(randomUUID(), input)).data.status, 'NOT_LINKED');
    await f.prisma.messengerBinding.create({data: {ownerId: f.otherOwnerId, channel: 'MAX', externalUserId: String(BigInt(otherMax) + 1n)}});
    await f.prisma.ownerNotificationPreference.update({where: {ownerId: f.otherOwnerId}, data: {quietStartMinute: 0, quietEndMinute: 1439}});
    const quiet = await request(randomUUID(), input);
    assert.equal(quiet.data.status, 'DEFERRED'); assert.ok(Date.parse(quiet.data.retryAt) > Date.now());
    assert.equal((await request(randomUUID(), {...input, expiresAt: new Date(Date.now() - 1000).toISOString()})).data.status, 'EXPIRED');
    assert.equal((await request(randomUUID(), {...staff, expiresAt: new Date(Date.now() - 1000).toISOString()})).data.status, 'EXPIRED');
    assert.equal(attempts.length, count);
  });

  await t.test('hotel notifications have a separate budget and cannot consume clinical or grooming limits', async () => {
    process.env.PET_HOTEL_NOTIFICATION_DAILY_LIMIT = '1';
    assert.equal((await request(randomUUID(), owner)).data.status, 'DEFERRED');
    process.env.CLINIC_ASSISTANT_REMINDERS_ENABLED = 'true'; process.env.CLINIC_ASSISTANT_NOTIFICATION_DAILY_LIMIT = '1';
    const clinical = {ownerId: f.ownerId, kind: 'APPOINTMENT_CHANGE', text: 'ТЕСТ: клиническое уведомление', expiresAt};
    assert.equal((await notifications.deliver(randomUUID(), clinical)).status, 'SENT');
    assert.equal((await notifications.deliver(randomUUID(), clinical)).status, 'DEFERRED');
    process.env.GROOMING_CLIENT_NOTIFICATIONS_ENABLED = 'true'; process.env.GROOMING_NOTIFICATION_DAILY_LIMIT = '1';
    assert.equal((await notifications.deliver(randomUUID(), {...clinical, kind: 'GROOMING_CHANGE'})).status, 'SENT');
  });

  await t.test('MAX client constructs the hotel cabinet link without external network access', async () => {
    const protectedFetch = globalThis.fetch, beforeToken = process.env.MAX_BOT_TOKEN, beforeBase = process.env.MAX_API_BASE_URL;
    let sent;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://max-hotel-qa.invalid/messages?')) {
        sent = JSON.parse(init.body);
        return new Response(JSON.stringify({message: {body: {mid: 'synthetic-provider-id'}}}), {status: 200, headers: {'content-type': 'application/json'}});
      }
      return protectedFetch(url, init);
    };
    process.env.MAX_API_BASE_URL = 'https://max-hotel-qa.invalid'; process.env.MAX_BOT_TOKEN = 'synthetic-not-a-real-token';
    try {
      await new MaxBotClient().sendMessage(ownerMax, 'Тест', 'pet-hotel');
      assert.equal(sent.attachments[0].payload.buttons[0][0].url, f.origin + '/portal/pet-hotel');
    } finally {
      globalThis.fetch = protectedFetch;
      for (const [key, value] of [['MAX_BOT_TOKEN', beforeToken], ['MAX_API_BASE_URL', beforeBase]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
});
