type GatewayEnvironment = Record<string, string | undefined>;

export function assertGatewaySecurityConfiguration(env: GatewayEnvironment = process.env) {
  if (env.NODE_ENV?.trim().toLowerCase() !== 'production') {
    return;
  }

  const publicUrl = env.OWNER_GATEWAY_PUBLIC_URL?.trim() ?? '';
  if (!isHttpsUrl(publicUrl)) {
    throw new Error('OWNER_GATEWAY_PUBLIC_URL должен быть публичным HTTPS-адресом');
  }

  assertStrongSecret('OWNER_GATEWAY_SYNC_SECRET', env.OWNER_GATEWAY_SYNC_SECRET);

  const vapidValues = [
    env.OWNER_GATEWAY_VAPID_SUBJECT,
    env.OWNER_GATEWAY_VAPID_PUBLIC_KEY,
    env.OWNER_GATEWAY_VAPID_PRIVATE_KEY,
  ].map((value) => value?.trim() ?? '');
  const configuredVapidValues = vapidValues.filter(Boolean).length;
  if (configuredVapidValues > 0 && configuredVapidValues < vapidValues.length) {
    throw new Error('Для push-уведомлений нужно заполнить все OWNER_GATEWAY_VAPID_* параметры');
  }

  validateOptionalSecret('MAX_WEBHOOK_SECRET', env.MAX_WEBHOOK_SECRET);
  validateOptionalSecret('TELEGRAM_WEBHOOK_SECRET', env.TELEGRAM_WEBHOOK_SECRET);
}

function validateOptionalSecret(name: string, value: string | undefined) {
  if (value?.trim()) {
    assertStrongSecret(name, value);
  }
}

function assertStrongSecret(name: string, value: string | undefined) {
  const normalized = value?.trim() ?? '';
  if (normalized.length < 32 || normalized === 'change-me') {
    throw new Error(`${name} должен быть случайной строкой длиной не менее 32 символов`);
  }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
