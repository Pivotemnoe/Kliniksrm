import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:http2';

export class PushTransportError extends Error {
  constructor(public readonly code: number, public readonly invalidToken = false, public readonly rejectedRetryable = false) { super('Native push provider status ' + code); }
}
let cachedFcm: { value: string; expires: number; identity: string } | null = null;
export async function sendFcm(input: { token: string; data: Record<string, string> }) {
  const path = process.env.STAFF_NATIVE_PUSH_FCM_CREDENTIALS_PATH!, project = process.env.STAFF_NATIVE_PUSH_FCM_PROJECT_ID!;
  if (!cachedFcm || cachedFcm.expires < Date.now() + 60000 || cachedFcm.identity !== path + project) {
    const key = JSON.parse(await readFile(path, 'utf8'));
    if (key.type !== 'service_account' || key.project_id !== project) throw new Error('Dedicated staff FCM project mismatch');
    const now = Math.floor(Date.now() / 1000), encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const jwt = unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
    if (!response.ok) throw new PushTransportError(response.status, false, [429, 503].includes(response.status));
    const result = await response.json() as { access_token: string; expires_in: number };
    cachedFcm = { value: result.access_token, expires: Date.now() + result.expires_in * 1000, identity: path + project };
  }
  const response = await fetch('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(project) + '/messages:send',
    { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization: 'Bearer ' + cachedFcm.value, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: input.token, data: input.data, android: { priority: 'high', ttl: '3600s' } } }) });
  const result = await response.json() as { name?: string; error?: { details?: Array<{ errorCode?: string }> } };
  if (!response.ok) throw new PushTransportError(response.status, result.error?.details?.some(item => item.errorCode === 'UNREGISTERED') || false, [429, 503].includes(response.status));
  return result.name || null;
}
let cachedApns: { value: string; createdAt: number; identity: string } | null = null;
export async function sendApns(input: { token: string; data: Record<string, string>; applicationId: string; environment: string; deliveryId: string }) {
  const path = process.env.STAFF_NATIVE_PUSH_APNS_KEY_PATH!, keyId = process.env.STAFF_NATIVE_PUSH_APNS_KEY_ID!, teamId = process.env.STAFF_NATIVE_PUSH_APNS_TEAM_ID!;
  const identity = path + keyId + teamId;
  if (!cachedApns || cachedApns.createdAt < Date.now() - 50 * 60000 || cachedApns.identity !== identity) {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = encode({ alg: 'ES256', kid: keyId }) + '.' + encode({ iss: teamId, iat: Math.floor(Date.now() / 1000) });
    const signature = createSign('SHA256').update(unsigned).sign({ key: await readFile(path, 'utf8'), dsaEncoding: 'ieee-p1363' }).toString('base64url');
    cachedApns = { value: unsigned + '.' + signature, createdAt: Date.now(), identity };
  }
  const jwt = cachedApns.value;
  return new Promise<string | null>((resolve, reject) => {
    const client = connect(input.environment === 'SANDBOX' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
    let settled = false;
    const finish = (error?: Error, receipt?: string | null) => { if (settled) return; settled = true; clearTimeout(timer); client.close(); error ? reject(error) : resolve(receipt || null); };
    const timer = setTimeout(() => { finish(new Error('APNs response unknown')); client.destroy(); }, 10000);
    client.once('error', error => finish(error));
    const request = client.request({ ':method': 'POST', ':path': '/3/device/' + input.token, authorization: 'bearer ' + jwt,
      'apns-topic': input.applicationId, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-id': input.deliveryId,
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600) });
    let status = 0, receipt: string | null = null, body = '';
    request.on('response', headers => { status = Number(headers[':status']); receipt = String(headers['apns-id'] || ''); });
    request.setEncoding('utf8'); request.on('data', chunk => { body += chunk; }); request.once('error', error => finish(error));
    request.on('end', () => {
      if (status === 200) return finish(undefined, receipt);
      const reason = (() => { try { return JSON.parse(body).reason; } catch { return ''; } })();
      finish(new PushTransportError(status, ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(reason), [429, 503].includes(status)));
    });
    request.end(JSON.stringify({ aps: { alert: { title: 'TemichevVet · Сотрудники', body: ['INTERNAL_MESSAGE', 'CLINIC_CHAT'].includes(input.data.kind) ? 'Новое сообщение в CRM' : 'Новое событие в CRM' }, sound: 'default' }, ...input.data }));
  });
}
