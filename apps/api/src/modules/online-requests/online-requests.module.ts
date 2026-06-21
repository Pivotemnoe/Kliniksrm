import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuditModule } from '../audit/audit.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { OnlineRequestsController } from './online-requests.controller';
import { OnlineRequestsService } from './online-requests.service';

@Module({
  imports: [AppointmentsModule, AuditModule, SchedulingModule],
  controllers: [OnlineRequestsController],
  providers: [OnlineRequestsService],
})
export class OnlineRequestsModule {}
