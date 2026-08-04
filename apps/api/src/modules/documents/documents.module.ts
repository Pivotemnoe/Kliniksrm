import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuditModule, FilesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentPdfService],
})
export class DocumentsModule {}
