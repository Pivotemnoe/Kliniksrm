import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClientPortalModule } from '../client-portal/client-portal.module';
import { FilesModule } from '../files/files.module';
import { MaxBotClient } from './providers/max-bot.client';
import { OwnerGatewayClient } from './providers/owner-gateway.client';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { OwnerGatewaySnapshotSyncService } from './owner-gateway-snapshot-sync.service';

@Module({
  imports: [AuditModule, ClientPortalModule, FilesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDispatcherService, OwnerGatewaySnapshotSyncService, MaxBotClient, OwnerGatewayClient],
  exports: [OwnerGatewayClient, OwnerGatewaySnapshotSyncService],
})
export class NotificationsModule {}
