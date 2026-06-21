import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuditModule, SchedulingModule, FinanceModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
