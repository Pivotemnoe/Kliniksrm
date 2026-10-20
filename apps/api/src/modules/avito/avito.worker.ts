import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AvitoApiClient } from './avito-api.client';
import { AvitoService } from './avito.service';

@Injectable()
export class AvitoWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private offset = 0;
  private nextPoll = 0;
  private failures = 0;
  private readonly logger = new Logger(AvitoWorker.name);
  constructor(private readonly service: AvitoService, private readonly api: AvitoApiClient) {}
  onModuleInit() { if (this.api.ingestionEnabled() || this.api.liveSendEnabled()) this.schedule(2000); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
  private schedule(ms: number) { if (!this.stopped) { this.timer = setTimeout(() => void this.run(), ms); this.timer.unref(); } }
  private async run() {
    try {
      await this.service.tick();
      if (this.api.ingestionEnabled() && Date.now() >= this.nextPoll) {
        const integration = await this.service.integration();
        if (integration.installation.enabled && integration.accountId) {
          const result = await this.service.sync(this.offset);
          this.offset = result.nextOffset ?? 0;
        }
        this.nextPoll = Date.now() + 60000;
      }
      this.failures = 0;
    } catch { this.failures++; if (this.failures === 1) this.logger.warn('Авито: обработка приостановлена до повторной проверки подключения.'); }
    finally { this.schedule(Math.min(300000, 15000 * 2 ** Math.min(this.failures, 4))); }
  }
}
