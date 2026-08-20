import { Injectable, MessageEvent, UnauthorizedException } from '@nestjs/common';
import { interval, map, merge, Observable, Subject, switchMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

export type LiveUpdate = {
  version: 1;
  scope: string;
  sourceClientId: string | null;
  at: string;
};

@Injectable()
export class LiveUpdatesService {
  private readonly updates = new Subject<LiveUpdate>();

  constructor(private readonly prisma: PrismaService) {}

  publish(scope: string, sourceClientId: string | null) {
    this.updates.next({ version: 1, scope, sourceClientId, at: new Date().toISOString() });
  }

  stream(sessionId: string, clientId: string | null): Observable<MessageEvent> {
    const updates = this.updates.pipe(
      map((update) => ({ type: 'message', data: update } satisfies MessageEvent)),
    );
    const heartbeat = interval(25_000).pipe(
      switchMap(async () => {
        const session = await this.prisma.session.findFirst({
          where: { id: sessionId, expiresAt: { gt: new Date() } },
          select: { id: true },
        });
        if (!session) throw new UnauthorizedException('Сессия истекла');
        return { type: 'heartbeat', data: { clientId, at: new Date().toISOString() } } satisfies MessageEvent;
      }),
    );

    return merge(updates, heartbeat);
  }
}
