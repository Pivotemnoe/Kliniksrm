import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { assertGatewaySecurityConfiguration } = require('../apps/owner-gateway/dist/runtime-config.js');
const { parseMaxBotStarted } = require('../apps/owner-gateway/dist/max-webhook.service.js');
const { parseTelegramBotStarted, parseTelegramStart } = require('../apps/owner-gateway/dist/telegram-webhook.service.js');

const inviteToken = 'A'.repeat(48);

test('рабочий шлюз требует HTTPS и сильный секрет синхронизации', () => {
  assert.throws(
    () => assertGatewaySecurityConfiguration({
      NODE_ENV: 'production',
      OWNER_GATEWAY_PUBLIC_URL: 'http://cabinet.example.ru',
      OWNER_GATEWAY_SYNC_SECRET: 'x'.repeat(48),
    }),
    /HTTPS/,
  );
  assert.throws(
    () => assertGatewaySecurityConfiguration({
      NODE_ENV: 'production',
      OWNER_GATEWAY_PUBLIC_URL: 'https://cabinet.example.ru',
      OWNER_GATEWAY_SYNC_SECRET: 'change-me',
    }),
    /OWNER_GATEWAY_SYNC_SECRET/,
  );
});

test('рабочий шлюз принимает полную безопасную конфигурацию', () => {
  assert.doesNotThrow(() => assertGatewaySecurityConfiguration({
    NODE_ENV: 'production',
    OWNER_GATEWAY_PUBLIC_URL: 'https://cabinet.example.ru',
    OWNER_GATEWAY_SYNC_SECRET: 'x'.repeat(48),
    OWNER_GATEWAY_VAPID_SUBJECT: 'mailto:clinic@example.ru',
    OWNER_GATEWAY_VAPID_PUBLIC_KEY: 'public-key',
    OWNER_GATEWAY_VAPID_PRIVATE_KEY: 'private-key',
  }));
});

test('неполная конфигурация push отклоняется до запуска шлюза', () => {
  assert.throws(
    () => assertGatewaySecurityConfiguration({
      NODE_ENV: 'production',
      OWNER_GATEWAY_PUBLIC_URL: 'https://cabinet.example.ru',
      OWNER_GATEWAY_SYNC_SECRET: 'x'.repeat(48),
      OWNER_GATEWAY_VAPID_PUBLIC_KEY: 'public-key',
    }),
    /OWNER_GATEWAY_VAPID/,
  );
});

test('MAX принимает только событие запуска с безопасным токеном и числовым пользователем', () => {
  assert.deepEqual(
    parseMaxBotStarted({
      update_type: 'bot_started',
      payload: inviteToken,
      user: { user_id: 12345 },
      chat_id: '98765',
    }),
    { payload: inviteToken, maxUserId: '12345', chatId: '98765' },
  );
  assert.equal(parseMaxBotStarted({ update_type: 'bot_started', payload: 'короткий', user: { user_id: 1 } }), null);
  assert.equal(parseMaxBotStarted({ update_type: 'message_created', payload: inviteToken, user: { user_id: 1 } }), null);
});

test('Telegram принимает /start и токен приглашения из личного чата', () => {
  assert.deepEqual(
    parseTelegramBotStarted({
      message: {
        text: `/start ${inviteToken}`,
        from: { id: 12345 },
        chat: { id: 12345 },
      },
    }),
    { payload: inviteToken, userId: '12345', chatId: '12345' },
  );
  assert.equal(parseTelegramBotStarted({ message: { text: '/start bad', from: { id: 1 }, chat: { id: 1 } } }), null);
});

test('привязанный Telegram может запросить новый вход обычной командой start только в личном чате', () => {
  assert.deepEqual(
    parseTelegramStart({ message: { text: '/start', from: { id: 12345 }, chat: { id: 12345 } } }),
    { payload: null, userId: '12345', chatId: '12345' },
  );
  assert.equal(
    parseTelegramStart({ message: { text: '/start', from: { id: 12345 }, chat: { id: -777 } } }),
    null,
  );
});

test('шлюз агрегирует первую активацию, последний вход и подключённые каналы по владельцу', async () => {
  const { InternalSyncService } = require('../apps/owner-gateway/dist/internal-sync.service.js');
  const service = new InternalSyncService({
    portalSession: {
      groupBy: async () => [{
        ownerId: 'owner-1',
        _min: { createdAt: new Date('2026-08-01T10:00:00.000Z') },
        _max: { lastSeenAt: new Date('2026-08-05T12:00:00.000Z') },
      }],
    },
    messengerBinding: {
      findMany: async () => [
        { ownerId: 'owner-1', channel: 'TELEGRAM' },
        { ownerId: 'owner-2', channel: 'MAX' },
      ],
    },
  }, null, null, null);

  const result = await service.getPortalStatistics();
  assert.equal(result.owners.length, 2);
  assert.equal(result.owners.find((owner) => owner.ownerId === 'owner-1')?.telegramLinked, true);
  assert.equal(result.owners.find((owner) => owner.ownerId === 'owner-1')?.lastSeenAt.toISOString(), '2026-08-05T12:00:00.000Z');
  assert.equal(result.owners.find((owner) => owner.ownerId === 'owner-2')?.maxLinked, true);
  assert.equal(result.owners.find((owner) => owner.ownerId === 'owner-2')?.activatedAt, null);
});

test('статус одного владельца возвращает не только мессенджеры, но и фактический вход', async () => {
  const { InternalSyncService } = require('../apps/owner-gateway/dist/internal-sync.service.js');
  const service = new InternalSyncService({
    ownerSnapshot: {
      findUnique: async () => ({
        syncedAt: new Date('2026-08-07T08:00:00.000Z'),
        bindings: [{ channel: 'MAX' }],
      }),
    },
    portalSession: {
      aggregate: async () => ({
        _min: { createdAt: new Date('2026-08-07T08:10:00.000Z') },
        _max: { lastSeenAt: new Date('2026-08-07T09:15:00.000Z') },
      }),
    },
  }, null, null, null);

  const result = await service.getStatus('owner-1');
  assert.equal(result.hasSnapshot, true);
  assert.equal(result.maxLinked, true);
  assert.equal(result.telegramLinked, false);
  assert.equal(result.activatedAt.toISOString(), '2026-08-07T08:10:00.000Z');
  assert.equal(result.lastSeenAt.toISOString(), '2026-08-07T09:15:00.000Z');
});
