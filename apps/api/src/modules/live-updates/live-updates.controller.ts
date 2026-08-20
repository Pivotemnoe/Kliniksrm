import { Controller, MessageEvent, Query, Req, Sse } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { LiveUpdatesService } from './live-updates.service';

@Controller('v1/live-updates')
export class LiveUpdatesController {
  constructor(private readonly liveUpdates: LiveUpdatesService) {}

  @Sse()
  stream(@Req() request: AuthenticatedRequest, @Query('clientId') clientId?: string): Observable<MessageEvent> {
    return this.liveUpdates.stream(request.auth!.sessionId, clientId?.trim().slice(0, 80) || null);
  }
}
