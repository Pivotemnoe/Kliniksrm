import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { HospitalController } from './hospital.controller';
import { HospitalService } from './hospital.service';

@Module({
  imports: [PrismaModule, AuditModule, SchedulingModule, FinanceModule],
  controllers: [HospitalController],
  providers: [HospitalService],
})
export class HospitalModule {}
