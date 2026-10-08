import { ClinicConversationSyncService } from './clinic-conversation-sync.service';
import { AssistantBookingService } from './assistant-booking.service';
import { AssistantBookingController } from './assistant-booking.controller';
import { AssistantBookingSyncService } from './assistant-booking-sync.service';
import { OnlineRequestAttentionService } from './online-request-attention.service';
import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuditModule } from '../audit/audit.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { OnlineRequestsController } from './online-requests.controller';
import { OnlineRequestsService } from './online-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { OwnerGatewayBookingSyncService } from './owner-gateway-booking-sync.service';

@Module({
  imports: [AppointmentsModule, AuditModule, SchedulingModule, NotificationsModule],
  controllers: [OnlineRequestsController, AssistantBookingController],
  providers: [OnlineRequestsService, OwnerGatewayBookingSyncService, OnlineRequestAttentionService, ClinicConversationSyncService, AssistantBookingService, AssistantBookingSyncService],
})
export class OnlineRequestsModule {}
