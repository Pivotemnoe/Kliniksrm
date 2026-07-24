import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

export function assertSecret(received: string | undefined, expected: string | undefined, notConfiguredMessage: string) {
  const configuredSecret = expected?.trim();

  if (!configuredSecret) {
    throw new ServiceUnavailableException(notConfiguredMessage);
  }

  const expectedBuffer = Buffer.from(configuredSecret);
  const receivedBuffer = Buffer.from(received ?? '');

  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new ForbiddenException('Некорректный секрет запроса');
  }
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeBaseUrl(value: string | undefined) {
  return value?.trim().replace(/\/+$/, '') ?? '';
}
