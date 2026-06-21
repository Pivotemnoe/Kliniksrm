import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AnimalCatalogService } from './animal-catalog.service';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';

@Module({
  imports: [AuditModule, SchedulingModule],
  controllers: [AnimalsController],
  providers: [AnimalsService, AnimalCatalogService],
  exports: [AnimalCatalogService],
})
export class AnimalsModule {}
