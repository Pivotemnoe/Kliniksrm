import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryService } from './laboratory.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService],
})
export class LaboratoryModule {}
