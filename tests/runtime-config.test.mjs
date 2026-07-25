import assert from 'node:assert/strict';
import test from 'node:test';
import runtimeConfig from '../apps/api/dist/config/runtime-config.js';

const {
  assertRuntimeSecurityConfiguration,
  isApiDocumentationEnabled,
  shouldExposePortalDebugCode,
  shouldUseSecureSessionCookie,
} = runtimeConfig;

test('локальная рабочая CRM использует HTTP cookie при APP_URL с http', () => {
  assert.equal(
    shouldUseSecureSessionCookie({ SESSION_COOKIE_SECURE: 'auto', APP_URL: 'http://192.168.1.20:3000' }),
    false,
  );
});

test('публичная HTTPS-система автоматически включает secure cookie', () => {
  assert.equal(
    shouldUseSecureSessionCookie({ SESSION_COOKIE_SECURE: 'auto', APP_URL: 'https://cabinet.example.ru' }),
    true,
  );
});

test('явная настройка cookie имеет приоритет над адресом', () => {
  assert.equal(
    shouldUseSecureSessionCookie({ SESSION_COOKIE_SECURE: 'false', APP_URL: 'https://cabinet.example.ru' }),
    false,
  );
});

test('техническая документация и тестовые коды выключены по умолчанию', () => {
  assert.equal(isApiDocumentationEnabled({}), false);
  assert.equal(shouldExposePortalDebugCode({}), false);
});

test('рабочая конфигурация отклоняет известный секрет', () => {
  assert.throws(
    () => assertRuntimeSecurityConfiguration({ NODE_ENV: 'production', SESSION_SECRET: 'change-me' }),
    /SESSION_SECRET/,
  );
});

test('рабочая конфигурация запрещает тестовые данные и отладочные коды', () => {
  const base = {
    NODE_ENV: 'production',
    SESSION_SECRET: 'a'.repeat(48),
    APP_URL: 'http://192.168.1.20:3000',
  };

  assert.throws(() => assertRuntimeSecurityConfiguration({ ...base, SEED_TEST_DATA: 'true' }), /SEED_TEST_DATA/);
  assert.throws(
    () => assertRuntimeSecurityConfiguration({ ...base, CLIENT_PORTAL_DEBUG_CODES: 'true' }),
    /CLIENT_PORTAL_DEBUG_CODES/,
  );
  assert.doesNotThrow(() => assertRuntimeSecurityConfiguration({ ...base, SEED_TEST_DATA: 'false' }));
});

test('клинический режим проверяется независимо от NODE_ENV старой установки', () => {
  assert.throws(
    () =>
      assertRuntimeSecurityConfiguration({
        NODE_ENV: 'development',
        CLINIC_RUNTIME_MODE: 'production',
        SESSION_SECRET: 'change-me',
        APP_URL: 'http://192.168.1.20:3000',
      }),
    /SESSION_SECRET/,
  );
});
