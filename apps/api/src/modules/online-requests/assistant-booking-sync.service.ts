import { ConflictException, HttpException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AssistantBookingService } from './assistant-booking.service';

type Operation = { id: string; kind: string; ownerId: string; conversationId: string; bookingSequence: number; input: { serviceId?: string; serviceQuery?: string; preferredTimeText?: string; date?: string; from?: string; days?: number; recentVisitAnswer?: boolean; animalId: string; offerToken: string; comment?: string; contactPhone?: string; contactConsent: boolean; appointmentConsent: boolean }; conversation: { mode: string } };
@Injectable()
export class AssistantBookingSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(AssistantBookingSyncService.name);
  constructor(private readonly booking: AssistantBookingService) {}
  private enabled() { return process.env.CLINIC_ASSISTANT_ENABLED === 'true' && process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED === 'true'; }
  onApplicationBootstrap() { if (this.enabled()) { this.timer = setInterval(() => void this.syncNow(), 5000); this.timer.unref(); void this.syncNow(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async syncNow() {
    if (!this.enabled()) return { status: 'disabled' };
    if (this.running) return { status: 'running' };
    this.running = true;
    try {
      const { items } = await this.gateway<{ items: Operation[] }>('/booking-operations');
      for (const item of items) {
        let result: unknown;
        try {
          if (item.kind === 'OPTIONS') {
            if (item.conversation.mode !== 'ASSISTANT') throw new ConflictException('Обращение сейчас обрабатывает администратор');
            result = await this.booking.options({ ownerId: item.ownerId, serviceId: item.input.serviceId, serviceQuery: item.input.serviceQuery, preferredTimeText: item.input.preferredTimeText, date: item.input.date, from: item.input.from, days: item.input.days, recentVisitAnswer: item.input.recentVisitAnswer });
          } else if (item.kind === 'CONFIRM') {
            // Identity and episode come from the authenticated gateway queue, never public text.
            // A late replay may return an already committed booking after takeover, but cannot create one.
            result = await this.booking.book({ ownerId: item.ownerId, conversationId: item.conversationId, bookingSequence: item.bookingSequence,
              clientKey: item.id, animalId: item.input.animalId, offerToken: item.input.offerToken, comment: item.input.comment, contactPhone: item.input.contactPhone,
              contactConsent: item.input.contactConsent, appointmentConsent: item.input.appointmentConsent }, new Date(), item.conversation.mode === 'ASSISTANT');
          } else throw new ConflictException('Неизвестный запрос записи');
        } catch (error) {
          if (!(error instanceof HttpException) || error.getStatus() >= 500 || error.getStatus() === 429) throw error;
          await this.gateway(`/booking-operations/${encodeURIComponent(item.id)}/result`, { status: 'FAILED', error: error.message.slice(0, 300) });
          continue;
        }
        await this.gateway(`/booking-operations/${encodeURIComponent(item.id)}/result`, { status: 'DONE', result });
      }
      return { status: 'synced', count: items.length };
    } catch { this.logger.warn('Запросы самостоятельной записи сохранены; синхронизация будет повторена'); return { status: 'unavailable' }; }
    finally { this.running = false; }
  }
  private async gateway<T = unknown>(path: string, body?: unknown): Promise<T> {
    const base = process.env.OWNER_GATEWAY_URL?.trim().replace(/\/+$/, ''), secret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();
    if (!base || !secret || secret.length < 16) throw new Error('Gateway unavailable');
    const response = await fetch(`${base}/internal/v1/assistant${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-owner-gateway-secret': secret, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000), redirect: 'manual' });
    if (!response.ok) throw new Error('Gateway unavailable');
    return response.json() as Promise<T>;
  }
}
