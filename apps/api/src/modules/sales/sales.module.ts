import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AuditModule, SchedulingModule, FinanceModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
