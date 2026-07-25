import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { assertGatewaySecurityConfiguration } = require('../apps/owner-gateway/dist/runtime-config.js');
const { parseMaxBotStarted } = require('../apps/owner-gateway/dist/max-webhook.service.js');
const { parseTelegramBotStarted } = require('../apps/owner-gateway/dist/telegram-webhook.service.js');

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
