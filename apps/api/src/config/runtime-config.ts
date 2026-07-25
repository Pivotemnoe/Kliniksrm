type RuntimeEnvironment = Record<string, string | undefined>;

const trueValues = new Set(['1', 'true', 'yes', 'y', 'on']);
const falseValues = new Set(['0', 'false', 'no', 'n', 'off']);

export function isProductionEnvironment(env: RuntimeEnvironment = process.env) {
  const mode = env.CLINIC_RUNTIME_MODE ?? env.NODE_ENV;
  return mode?.trim().toLowerCase() === 'production';
}

export function shouldExposePortalDebugCode(env: RuntimeEnvironment = process.env) {
  return readBoolean(env.CLIENT_PORTAL_DEBUG_CODES, false);
}

export function isApiDocumentationEnabled(env: RuntimeEnvironment = process.env) {
  return readBoolean(env.API_DOCS_ENABLED, false);
}

export function shouldUseSecureSessionCookie(env: RuntimeEnvironment = process.env) {
  const configured = env.SESSION_COOKIE_SECURE?.trim().toLowerCase() || 'auto';

  if (trueValues.has(configured)) {
    return true;
  }

  if (falseValues.has(configured)) {
    return false;
  }

  if (configured !== 'auto') {
    throw new Error('SESSION_COOKIE_SECURE должен быть true, false или auto');
  }

  const origins = (env.APP_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 && origins.every((origin) => getProtocol(origin) === 'https:');
}

export function assertRuntimeSecurityConfiguration(env: RuntimeEnvironment = process.env) {
  shouldUseSecureSessionCookie(env);

  if (!isProductionEnvironment(env)) {
    return;
  }

  const sessionSecret = env.SESSION_SECRET?.trim() ?? '';
  if (sessionSecret.length < 32 || sessionSecret === 'change-me') {
    throw new Error('SESSION_SECRET должен быть случайной строкой длиной не менее 32 символов');
  }

  if (readBoolean(env.SEED_TEST_DATA, false)) {
    throw new Error('SEED_TEST_DATA нельзя включать в рабочей клинической среде');
  }

  if (shouldExposePortalDebugCode(env)) {
    throw new Error('CLIENT_PORTAL_DEBUG_CODES нельзя включать в рабочей клинической среде');
  }
}

function readBoolean(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (trueValues.has(normalized)) {
    return true;
  }

  if (falseValues.has(normalized)) {
    return false;
  }

  return fallback;
}

function getProtocol(value: string) {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
}
