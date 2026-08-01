import { timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';

export function isRemoteGatewayRequest(request: AuthenticatedRequest) {
  const marker = singleHeader(request.headers['x-temichevvet-remote-access']);
  if (marker !== '1') {
    const publicHost = configuredPublicHost();
    const requestHost = singleHeader(request.headers['x-forwarded-host']) ?? singleHeader(request.headers.host);
    if (publicHost && requestHost?.split(':')[0]?.toLowerCase() === publicHost) {
      throw new UnauthorizedException('Удалённый шлюз не добавил обязательную защитную отметку');
    }
    return false;
  }

  const expected = process.env.REMOTE_ACCESS_GATEWAY_SECRET?.trim();
  const received = singleHeader(request.headers['x-temichevvet-gateway-secret']);
  if (!expected || !received || !safeEqual(expected, received)) {
    throw new UnauthorizedException('Удалённый шлюз не прошёл проверку');
  }

  return true;
}

function configuredPublicHost() {
  const value = process.env.REMOTE_STAFF_PUBLIC_URL?.trim();
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function singleHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
