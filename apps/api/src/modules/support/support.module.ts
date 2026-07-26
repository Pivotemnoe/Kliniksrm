import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { BackupsModule } from '../backups/backups.module';
import { LicenseGuard } from './license.guard';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [AuditModule, BackupsModule],
  controllers: [SupportController],
  providers: [
    SupportService,
    { provide: APP_GUARD, useClass: LicenseGuard },
  ],
  exports: [SupportService],
})
export class SupportModule {}
