import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [AuditModule, SchedulingModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
