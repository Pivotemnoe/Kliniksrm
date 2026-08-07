import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StaffAlertsController } from './staff-alerts.controller';
import { StaffAlertsService } from './staff-alerts.service';

@Module({
  imports: [AuditModule],
  controllers: [StaffAlertsController],
  providers: [StaffAlertsService],
})
export class StaffAlertsModule {}
