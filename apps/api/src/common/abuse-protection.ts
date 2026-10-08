import { HttpException } from '@nestjs/common';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import type { AuthenticatedRequest } from '../modules/auth/auth.types';
import { isRemoteGatewayRequest } from '../modules/remote-access/remote-request';

export class BoundedRateLimiter {
  private readonly windows = new Map<string, { until: number; count: number }>();
  constructor(private readonly capacity = 10_000, private readonly clock = Date.now) {}
  consume(key: string, maximum: number, duration = 600_000) {
    const now = this.clock(); let entry = this.windows.get(key);
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
export function normalizedPath(url: string) { return decodeURIComponent(url.split('?')[0]).toLowerCase().replace(/\/+$/, '') || '/'; }
export function apiBodyParsers(bodyLimit: string) {
  const smallJson = json({ limit: '64kb' }), largeJson = json({ limit: bodyLimit });
  const smallForm = urlencoded({ limit: '64kb', extended: false }), largeForm = urlencoded({ limit: bodyLimit, extended: true });
  return (req: Request, res: Response, next: NextFunction) => {
    const path = normalizedPath(req.originalUrl || req.url);
    const small = path === '/api/v1/online-requests' || path.startsWith('/api/auth/') || path.includes('/client-portal/') || path === '/api/v1/remote-access/enroll';
    (small ? smallJson : largeJson)(req, res, error => error ? next(error) : (small ? smallForm : largeForm)(req, res, next));
  };
}
export function clientIp(request: AuthenticatedRequest) {
  // Only the authenticated remote edge may supply a two-hop client chain.
  if (request.headers['x-temichevvet-remote-access'] === '1' && isRemoteGatewayRequest(request)) {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      // One public edge and one clinic web hop: discard any client prefix.
      const hops = forwarded.split(',').map(value => value.trim());
      return hops[Math.max(0, hops.length - 2)];
    }
  }
  return request.ip || request.socket?.remoteAddress || 'unknown';
}
export function apiAbuseProtection() {
  const limits = new BoundedRateLimiter();
  return (request: Request, response: Response, next: NextFunction) => {
    try {
      const path = normalizedPath(request.originalUrl || request.url);
      const ip = clientIp(request);
      // Shared LAN/NAT: this is only a coarse transport cap, not a staff quota.
      limits.consume(`all:${ip}`, 6000, 60_000);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        limits.consume(`write:${ip}`, 3000, 60_000);
        if (path === '/api/auth/login' || path === '/api/v1/remote-access/enroll' || /\/client-portal\/auth\/(request-code|verify-code)$/.test(path)) limits.consume(`login:${ip}`, 30);
        if (path === '/api/v1/online-requests' || /\/client-portal\/[^/]+\/online-requests$/.test(path)) limits.consume(`booking:${ip}`, 10);
        if ((path === '/api/v1/online-requests' || path === '/api/auth/login' || path.includes('/client-portal/auth/')) && Number(request.get('content-length')) > 65536) {
          response.status(413).json({ statusCode: 413, message: 'Слишком большой запрос' }); return;
        }
      }
      next();
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 400;
      if (status === 429) response.setHeader('Retry-After', (error as { retryAfter?: number }).retryAfter || 60);
      response.status(status).json({ statusCode: status, message: error instanceof HttpException ? error.message : 'Некорректный запрос' });
    }
  };
}
const staffLimits = new BoundedRateLimiter();
export function limitStaffMutation(request: AuthenticatedRequest) {
  if (request.auth && !['GET', 'HEAD', 'OPTIONS'].includes(request.method || 'GET')) {
    staffLimits.consume(`staff:${request.auth.userId}`, 300, 60_000);
    staffLimits.consume(`staff-long:${request.auth.userId}`, 1500);
  }
}
