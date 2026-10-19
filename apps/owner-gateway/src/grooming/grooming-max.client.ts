import { Injectable } from '@nestjs/common';
export class GroomingDeliveryError extends Error {
 constructor(public readonly code: string, public readonly retryable: boolean, public readonly uncertain = false) { super(code); }
}
@Injectable()
export class GroomingMaxClient {
 configured() { return Boolean((process.env.GROOMING_MAX_BOT_TOKEN || process.env.MAX_BOT_TOKEN)?.trim()); }
 async send(recipientId: string, text: string): Promise<string> {
  const token = (process.env.GROOMING_MAX_BOT_TOKEN || process.env.MAX_BOT_TOKEN)?.trim();
  if (!token) throw new GroomingDeliveryError('NOT_CONFIGURED', false);
  const base = (process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru').replace(/\/+$/, '');
  const target = new URL(base);
  if (target.protocol !== 'https:') throw new GroomingDeliveryError('INVALID_MAX_URL', false);
  let response: Response;
  try {
   response = await fetch(base + '/messages?user_id=' + encodeURIComponent(recipientId), {
    method:'POST', redirect:'manual', headers:{Authorization:token,'Content-Type':'application/json'},
    body:JSON.stringify({text}), signal:AbortSignal.timeout(10000)
   });
  } catch { throw new GroomingDeliveryError('DELIVERY_UNCERTAIN', false, true); }
  if (response.status === 429) throw new GroomingDeliveryError('RATE_LIMITED', true);
  if (!response.ok) throw new GroomingDeliveryError('MAX_HTTP_' + response.status, false, response.status >= 500);
  const payload = await response.json().catch(() => null) as {message?:{body?:{mid?:string}}} | null;
  const mid = payload?.message?.body?.mid;
  if (!mid) throw new GroomingDeliveryError('DELIVERY_UNCERTAIN', false, true);
  return mid;
 }
}
