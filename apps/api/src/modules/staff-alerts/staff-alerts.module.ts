import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StaffAlertsController } from './staff-alerts.controller';
import { StaffAlertsService } from './staff-alerts.service';
import { VisitOverdueAlertTrackerService } from './visit-overdue-alert-tracker.service';

@Module({
  imports: [AuditModule],
  controllers: [StaffAlertsController],
  providers: [StaffAlertsService, VisitOverdueAlertTrackerService],
  exports: [VisitOverdueAlertTrackerService],
})
export class StaffAlertsModule {}
