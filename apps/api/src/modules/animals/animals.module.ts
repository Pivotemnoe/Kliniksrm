import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';

@Module({
  imports: [AuditModule],
  controllers: [AnimalsController],
  providers: [AnimalsService],
})
export class AnimalsModule {}

