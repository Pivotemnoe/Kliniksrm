import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
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
}
