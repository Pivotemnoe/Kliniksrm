import { createPublicKey, verify } from 'node:crypto';

export const offlineLicenseFormat = 'temichevvet-offline-license-v1';

export type LicenseMode = 'compatibility' | 'advisory' | 'required';

export type OfflineLicensePayload = {
  licenseId: string;
  customer: string;
  installationId: string;
  hostFingerprint: string;
  issuedAt: string;
  validUntil: string;
  features: string[];
  maxOffices?: number;
};

export type SignedOfflineLicense = {
  format: typeof offlineLicenseFormat;
  payload: string;
  signature: string;
};

export function resolveLicenseMode(env: NodeJS.ProcessEnv = process.env): LicenseMode {
  const mode = env.TEMICHEVVET_LICENSE_MODE?.trim().toLowerCase() || 'compatibility';
  if (mode === 'compatibility' || mode === 'advisory' || mode === 'required') return mode;
  throw new Error('TEMICHEVVET_LICENSE_MODE должен быть compatibility, advisory или required');
}

export function readLicensePublicKey(env: NodeJS.ProcessEnv = process.env) {
  const encoded = env.TEMICHEVVET_LICENSE_PUBLIC_KEY_B64?.trim();
  if (encoded) return Buffer.from(encoded, 'base64').toString('utf8');
  return env.TEMICHEVVET_LICENSE_PUBLIC_KEY_PEM?.replace(/\\n/g, '\n').trim() || null;
}

export function parseAndVerifyOfflineLicense(document: string, publicKeyPem: string): OfflineLicensePayload {
  let signed: SignedOfflineLicense;
  try {
    signed = JSON.parse(document) as SignedOfflineLicense;
  } catch {
    throw new Error('Файл лицензии не является корректным JSON');
  }
  if (signed.format !== offlineLicenseFormat || !signed.payload || !signed.signature) {
    throw new Error('Формат лицензии не поддерживается');
  }

  const payloadBytes = decodeBase64Url(signed.payload, 'данные лицензии');
  const signature = decodeBase64Url(signed.signature, 'подпись лицензии');
  let payload: OfflineLicensePayload;
  try {
    payload = JSON.parse(payloadBytes.toString('utf8')) as OfflineLicensePayload;
  } catch {
    throw new Error('Содержимое лицензии повреждено');
  }
  validatePayload(payload);
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw new Error('Открытый ключ лицензии настроен неверно');
  }
  if (!verify(null, Buffer.from(canonicalLicensePayload(payload), 'utf8'), publicKey, signature)) {
    throw new Error('Подпись лицензии не прошла проверку');
  }
  return payload;
}

export function canonicalLicensePayload(payload: OfflineLicensePayload) {
  return JSON.stringify(sortValue(payload));
}

function validatePayload(payload: OfflineLicensePayload) {
  for (const [title, value] of [
    ['номер лицензии', payload.licenseId],
    ['клиника', payload.customer],
    ['установка', payload.installationId],
    ['компьютер', payload.hostFingerprint],
  ] as const) {
    if (typeof value !== 'string' || value.trim().length < 3) throw new Error(`В лицензии не заполнено поле «${title}»`);
  }
  for (const [title, value] of [['дата выдачи', payload.issuedAt], ['срок действия', payload.validUntil]] as const) {
    if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) throw new Error(`В лицензии некорректное поле «${title}»`);
  }
  if (!Array.isArray(payload.features) || payload.features.some((feature) => typeof feature !== 'string')) {
    throw new Error('В лицензии некорректно указан набор функций');
  }
  if (payload.maxOffices !== undefined && (!Number.isInteger(payload.maxOffices) || payload.maxOffices < 1)) {
    throw new Error('В лицензии некорректно указано количество филиалов');
  }
}

function decodeBase64Url(value: string, title: string) {
  try {
    const buffer = Buffer.from(value, 'base64url');
    if (!buffer.length) throw new Error('empty');
    return buffer;
  } catch {
    throw new Error(`Некорректное поле «${title}»`);
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortValue(child)]));
}
