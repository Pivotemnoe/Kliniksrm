import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [AuditModule, SchedulingModule],
  controllers: [QueueController],
  providers: [QueueService],
})
export class QueueModule {}

