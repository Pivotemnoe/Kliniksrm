import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [AuditModule, FilesModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
  exports: [ClientPortalService],
})
export class ClientPortalModule {}
