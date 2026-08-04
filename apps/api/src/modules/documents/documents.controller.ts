import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { CreateVisitDocumentDto } from './dto/create-visit-document.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';
import { UpdateVisitDocumentDto } from './dto/update-visit-document.dto';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@Controller('v1')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('document-templates')
  @RequirePermissions('documents.read')
  @ApiOkResponse({ description: 'Document templates.' })
  listTemplates() {
    return this.documentsService.listTemplates();
  }

  @Post('document-templates')
  @RequirePermissions('documents.manage')
  @ApiCreatedResponse({ description: 'Document template created.' })
  createTemplate(@Body() dto: CreateDocumentTemplateDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.documentsService.createTemplate(dto, actor.id);
  }

  @Patch('document-templates/:templateId')
  @RequirePermissions('documents.manage')
  @ApiOkResponse({ description: 'Document template updated.' })
  updateTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateDocumentTemplateDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.documentsService.updateTemplate(templateId, dto, actor.id);
  }

  @Get('visits/:visitId/documents')
  @RequirePermissions('documents.read')
  @ApiOkResponse({ description: 'Visit documents.' })
  listVisitDocuments(@Param('visitId') visitId: string) {
    return this.documentsService.listVisitDocuments(visitId);
  }

  @Post('visits/:visitId/documents')
  @RequirePermissions('documents.manage')
  @ApiCreatedResponse({ description: 'Visit document created.' })
  createVisitDocument(
    @Param('visitId') visitId: string,
    @Body() dto: CreateVisitDocumentDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.documentsService.createVisitDocument(visitId, dto, actor.id);
  }

  @Patch('visits/:visitId/documents/:documentId')
  @RequirePermissions('documents.manage')
  @ApiOkResponse({ description: 'Visit document updated.' })
  updateVisitDocument(
    @Param('visitId') visitId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateVisitDocumentDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.documentsService.updateVisitDocument(visitId, documentId, dto, actor.id);
  }

  @Get('visits/:visitId/documents/:documentId/pdf')
  @RequirePermissions('documents.print')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Immutable generated PDF.' })
  async openGeneratedPdf(
    @Param('visitId') visitId: string,
    @Param('documentId') documentId: string,
    @CurrentEmployee() actor: AuthEmployee,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { file, stream } = await this.documentsService.openGeneratedPdf(visitId, documentId, actor.id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', inlineContentDisposition(file.originalName));
    if (file.sizeBytes !== null) response.setHeader('Content-Length', String(file.sizeBytes));
    return new StreamableFile(stream);
  }

  @Delete('visits/:visitId/documents/:documentId')
  @RequirePermissions('documents.manage')
  @ApiOkResponse({ description: 'Draft visit document deleted.' })
  deleteVisitDocument(
    @Param('visitId') visitId: string,
    @Param('documentId') documentId: string,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.documentsService.deleteVisitDocument(visitId, documentId, actor.id);
  }
}

function inlineContentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'document.pdf';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
