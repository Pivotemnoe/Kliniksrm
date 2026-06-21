import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { MedicalPhrasesModule } from '../medical-phrases/medical-phrases.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [AuditModule, SchedulingModule, FinanceModule, MedicalPhrasesModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
