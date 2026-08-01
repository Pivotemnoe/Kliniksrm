import { shouldUseSecureSessionCookie } from '../../config/runtime-config';

export const REMOTE_DEVICE_COOKIE_NAME = process.env.REMOTE_DEVICE_COOKIE_NAME ?? 'temichevvet_remote_device';
export const REMOTE_DEVICE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export function getRemoteDeviceCookieOptions(maxAge = REMOTE_DEVICE_MAX_AGE_MS) {
  const remoteUrl = process.env.REMOTE_STAFF_PUBLIC_URL?.trim();
  const remoteIsHttps = remoteUrl ? safeProtocol(remoteUrl) === 'https:' : false;
  return {
    httpOnly: true,
    secure: remoteIsHttps || shouldUseSecureSessionCookie(),
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  };
}

function safeProtocol(value: string) {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
}
