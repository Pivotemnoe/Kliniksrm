export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? 'clinic_crm_session';

export function parseCookie(cookieHeader: string | string[] | undefined, name: string) {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader;

  if (!header) {
    return null;
  }

  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');

    if (rawKey === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return null;
}

export function getCookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

