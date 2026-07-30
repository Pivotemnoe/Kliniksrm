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
  controllers: [OnlineRequestsController],
  providers: [OnlineRequestsService, OwnerGatewayBookingSyncService],
})
export class OnlineRequestsModule {}
