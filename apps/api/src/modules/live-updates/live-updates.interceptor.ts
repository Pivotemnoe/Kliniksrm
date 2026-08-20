import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { LiveUpdatesService } from './live-updates.service';

@Injectable()
export class LiveUpdatesInterceptor implements NestInterceptor {
  constructor(private readonly liveUpdates: LiveUpdatesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = (request.method ?? 'GET').toUpperCase();
    const requestUrl = request.originalUrl ?? request.url ?? '';
    if (['GET', 'HEAD', 'OPTIONS'].includes(method) || !request.auth || !requestUrl.startsWith('/api/v1/')) return next.handle();

    const scope = extractScope(requestUrl);
    const sourceClientId = cleanClientId(request.headers['x-temichevvet-client-id']);
    return next.handle().pipe(
      tap(() => this.liveUpdates.publish(scope, sourceClientId)),
    );
  }
}

function extractScope(url: string) {
  return url.match(/\/api\/v1\/([^/?]+)/)?.[1] ?? 'all';
}

function cleanClientId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim().slice(0, 80) || null;
}
