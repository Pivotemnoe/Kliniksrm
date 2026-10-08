import { HttpException } from '@nestjs/common';
import { json, type NextFunction, type Request, type Response } from 'express';
import { assertSecret } from './security';

// Expired entries may be removed; live penalties must never be evicted/reset.
export class BoundedRateLimiter {
  private readonly windows = new Map<string, { until: number; count: number }>();
  constructor(private readonly capacity = 10_000, private readonly clock = Date.now) {}
  consume(key: string, maximum: number, duration = 600_000) {
    const now = this.clock();
    let entry = this.windows.get(key);
    if (entry && entry.until <= now) { this.windows.delete(key); entry = undefined; }
    if (!entry) {
      if (this.windows.size >= this.capacity) {
        for (const [id, value] of this.windows) if (value.until <= now) this.windows.delete(id);
        if (this.windows.size >= this.capacity) this.reject(60);
      }
      entry = { until: now + duration, count: 0 }; this.windows.set(key, entry);
    }
    if (entry.count >= maximum) this.reject(Math.ceil((entry.until - now) / 1000));
    entry.count++;
  }
  private reject(seconds: number): never {
    const error = new HttpException('Слишком много запросов. Попробуйте позже.', 429);
    Object.assign(error, { retryAfter: Math.max(1, seconds) }); throw error;
  }
}
export function normalizedPath(url: string) {
  return decodeURIComponent(url.split('?')[0]).toLowerCase().replace(/\/+$/, '') || '/';
}
export function gatewayAbuseProtection() {
  const limits = new BoundedRateLimiter();
  const publicJson = json({ limit: '64kb' });
  const internalJson = json({ limit: process.env.OWNER_GATEWAY_BODY_LIMIT?.trim() || '24mb' });
  return (request: Request, response: Response, next: NextFunction) => {
    try {
      const path = normalizedPath(request.originalUrl || request.url);
      const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
      if (path.startsWith('/internal/')) {
        assertSecret(request.get('x-owner-gateway-secret'), process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет синхронизации не настроен');
        return internalJson(request, response, next);
      }
      if (path.startsWith('/v1/webhooks/')) {
        const max = path === '/v1/webhooks/max';
        assertSecret(request.get(max ? 'x-max-bot-api-secret' : 'x-telegram-bot-api-secret-token'), process.env[max ? 'MAX_WEBHOOK_SECRET' : 'TELEGRAM_WEBHOOK_SECRET'], 'Секрет webhook не настроен');
        limits.consume('webhooks', 3000, 60_000);
        return publicJson(request, response, next);
      }
      const ip = request.ip || request.socket.remoteAddress || 'unknown';
      limits.consume('public:all', 6000, 60_000);
      limits.consume(`read:${ip}`, 600, 60_000);
      if (write) {
        limits.consume(`write:${ip}`, 300);
        limits.consume(`burst:${ip}`, 60, 60_000);
        if (path === '/v1/portal/sessions') limits.consume(`login:${ip}`, 20);
        if (path === '/v1/public/assistant/messages') limits.consume(`chat:${ip}`, 20, 60_000);
        if (['/v1/portal/booking-requests', '/v1/public/assistant/booking', '/v1/public/assistant/slot-confirmation', '/v1/public/clinic/inquiries'].includes(path)) limits.consume(`booking:${ip}`, 10);
      }
      return publicJson(request, response, next);
    } catch (error) {
      if (error instanceof HttpException) {
        if (error.getStatus() === 429) response.setHeader('Retry-After', (error as HttpException & { retryAfter?: number }).retryAfter || 60);
        response.status(error.getStatus()).json({ statusCode: error.getStatus(), message: error.message }); return;
      }
      response.status(400).json({ statusCode: 400, message: 'Некорректный запрос' });
    }
  };
}
