import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClientPortalModule } from '../client-portal/client-portal.module';
import { MaxBotClient } from './providers/max-bot.client';
import { OwnerGatewayClient } from './providers/owner-gateway.client';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  imports: [AuditModule, ClientPortalModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDispatcherService, MaxBotClient, OwnerGatewayClient],
})
export class NotificationsModule {}
