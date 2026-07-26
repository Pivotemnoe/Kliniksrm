import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ImportsController } from './imports.controller';
import { DataTransferService } from './data-transfer.service';

@Module({
  imports: [AuditModule],
  controllers: [ImportsController],
  providers: [DataTransferService],
})
export class ImportsModule {}
