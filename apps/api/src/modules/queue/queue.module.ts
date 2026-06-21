import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnimalsModule } from '../animals/animals.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [AuditModule, AnimalsModule, SchedulingModule],
  controllers: [QueueController],
  providers: [QueueService],
})
export class QueueModule {}
