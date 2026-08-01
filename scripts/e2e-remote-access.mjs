const baseUrl = (process.env.REMOTE_ACCESS_E2E_URL ?? 'http://127.0.0.1:4401/api').replace(/\/$/, '');
const login = process.env.REMOTE_ACCESS_E2E_LOGIN;
const password = process.env.REMOTE_ACCESS_E2E_PASSWORD;
const gatewaySecret = process.env.REMOTE_ACCESS_E2E_GATEWAY_SECRET;

if (!login || !password || !gatewaySecret) {
  throw new Error('Нужны REMOTE_ACCESS_E2E_LOGIN, REMOTE_ACCESS_E2E_PASSWORD и REMOTE_ACCESS_E2E_GATEWAY_SECRET');
}

const localLogin = await request('/auth/login', {
  method: 'POST',
  body: { login, password },
});
const localSession = requireCookie(localLogin.cookies, 'clinic_crm_session');

const me = await request('/auth/me', { cookie: localSession });
const employeeId = me.body.employee.id;

await request('/v1/remote-access/policy', {
  method: 'PATCH',
  cookie: localSession,
  body: { enabled: true, enrollmentTtlMinutes: 10, idleTimeoutMinutes: 15 },
});

const invitation = await request('/v1/remote-access/invitations', {
  method: 'POST',
  cookie: localSession,
  body: { employeeId, deviceName: 'E2E-проверка' },
});

const enrollment = await request('/v1/remote-access/enroll', {
  method: 'POST',
  remote: true,
  body: { code: invitation.body.code, deviceName: 'E2E-проверка' },
});
const deviceCookie = requireCookie(enrollment.cookies, 'temichevvet_remote_device');

const remoteLogin = await request('/auth/login', {
  method: 'POST',
  remote: true,
  cookie: deviceCookie,
  body: { login, password },
});
const remoteSession = requireCookie(remoteLogin.cookies, 'clinic_crm_session');
const remoteCookies = `${deviceCookie}; ${remoteSession}`;

const remoteOverview = await request('/v1/remote-access', { remote: true, cookie: remoteCookies });
const currentDevice = remoteOverview.body.devices.find((device) => device.current);
if (!currentDevice) throw new Error('API не отметил текущее удалённое устройство');

await request(`/v1/remote-access/devices/${currentDevice.id}`, {
  method: 'DELETE',
  cookie: localSession,
});

await request('/v1/remote-access', {
  remote: true,
  cookie: remoteCookies,
  expectedStatus: 401,
});

await request('/v1/remote-access/policy', {
  method: 'PATCH',
  cookie: localSession,
  body: { enabled: false },
});

console.log('REMOTE_ACCESS_E2E=PASS');
console.log(`EMPLOYEE=${me.body.employee.fullName}`);
console.log('CHECKS=local-login,one-time-enrollment,remote-login,current-device,revoke,session-block,disable');

async function request(path, options = {}) {
  const headers = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  if (options.remote) {
    headers['x-temichevvet-remote-access'] = '1';
    headers['x-temichevvet-gateway-secret'] = gatewaySecret;
    headers.host = 'staff.temichevvet.ru';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  const expectedStatus = options.expectedStatus;
  const accepted = expectedStatus === undefined ? response.ok : response.status === expectedStatus;
  if (!accepted) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ожидался ${expectedStatus ?? 'успешный ответ'}, получен ${response.status}: ${text}`);
  }

  return { body, cookies: getSetCookies(response.headers) };
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const combined = headers.get('set-cookie');
  return combined ? [combined] : [];
}

function requireCookie(cookies, name) {
  for (const header of cookies) {
    const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
    if (match) return `${name}=${match[1]}`;
  }
  throw new Error(`Ответ не установил cookie ${name}`);
}
