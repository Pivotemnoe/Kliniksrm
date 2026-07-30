import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ObjectStorageService } from './object-storage.service';

@Module({
  imports: [AuditModule],
  controllers: [FilesController],
  providers: [FilesService, ObjectStorageService],
  exports: [FilesService],
})
export class FilesModule {}
