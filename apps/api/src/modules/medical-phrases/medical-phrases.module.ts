import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MedicalPhrasesController } from './medical-phrases.controller';
import { MedicalPhrasesService } from './medical-phrases.service';
import { PracticeCollectionService } from './practice-collection.service';
import { PracticeHintsService } from './practice-hints.service';

@Module({
  imports: [AuditModule],
  controllers: [MedicalPhrasesController],
  providers: [MedicalPhrasesService, PracticeCollectionService, PracticeHintsService],
  exports: [MedicalPhrasesService],
})
export class MedicalPhrasesModule {}
