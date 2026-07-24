import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { InternalSyncController } from './internal-sync.controller';
import { InternalSyncService } from './internal-sync.service';
import { MaxBotClient } from './max-bot.client';
import { MaxWebhookController } from './max-webhook.controller';
import { MaxWebhookService } from './max-webhook.service';
import { PortalController } from './portal.controller';
import { PortalPageController } from './portal-page.controller';
import { PortalService } from './portal.service';
import { PrismaService } from './prisma.service';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramWebhookService } from './telegram-webhook.service';
import { WebPushService } from './web-push.service';

@Module({
  controllers: [
    HealthController,
    InternalSyncController,
    PortalController,
    PortalPageController,
    MaxWebhookController,
    TelegramWebhookController,
  ],
  providers: [
    PrismaService,
    InternalSyncService,
    PortalService,
    MaxBotClient,
    MaxWebhookService,
    TelegramBotClient,
    TelegramWebhookService,
    WebPushService,
  ],
})
export class AppModule {}
