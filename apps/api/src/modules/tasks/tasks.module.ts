import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [AuditModule, SchedulingModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
