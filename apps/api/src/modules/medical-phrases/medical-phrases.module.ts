import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MedicalPhrasesController } from './medical-phrases.controller';
import { MedicalPhrasesService } from './medical-phrases.service';

@Module({
  imports: [AuditModule],
  controllers: [MedicalPhrasesController],
  providers: [MedicalPhrasesService],
  exports: [MedicalPhrasesService],
})
export class MedicalPhrasesModule {}
