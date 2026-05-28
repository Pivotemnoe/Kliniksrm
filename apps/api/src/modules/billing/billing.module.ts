import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuditModule, SchedulingModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
