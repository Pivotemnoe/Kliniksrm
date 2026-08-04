import { Controller, Delete, Get, Header, Param, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequireAnyPermissions, RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FilesService, UploadedFilePayload } from './files.service';

const uploadInterceptor = FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

@ApiTags('files')
@Controller('v1/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('visits/:visitId')
  @RequirePermissions('documents.read')
  listVisitFiles(@Param('visitId') visitId: string) {
    return this.filesService.listVisitFiles(visitId);
  }

  @Post('visits/:visitId')
  @RequirePermissions('documents.manage')
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Medical attachment uploaded.' })
  uploadVisitFile(
    @Param('visitId') visitId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.filesService.uploadVisitFile(visitId, undefined, file, actor.id);
  }

  @Get('animals/:animalId')
  @RequirePermissions('documents.read')
  listAnimalFiles(@Param('animalId') animalId: string) {
    return this.filesService.listAnimalFiles(animalId);
  }

  @Post('animals/:animalId')
  @RequirePermissions('documents.manage')
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Patient archive attachment uploaded.' })
  uploadAnimalFile(
    @Param('animalId') animalId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.filesService.uploadAnimalFile(animalId, file, actor.id);
  }

  @Get('laboratory/orders/:orderId/items/:itemId')
  @RequirePermissions('laboratory.read')
  listLaboratoryFiles(@Param('orderId') orderId: string, @Param('itemId') itemId: string) {
    return this.filesService.listLaboratoryFiles(orderId, itemId);
  }

  @Post('laboratory/orders/:orderId/items/:itemId')
  @RequirePermissions('laboratory.manage')
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Laboratory result attachment uploaded.' })
  uploadLaboratoryFile(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.filesService.uploadLaboratoryFile(orderId, itemId, file, actor.id);
  }

  @Get('laboratory/orders/:orderId')
  @RequirePermissions('laboratory.read')
  listLaboratoryOrderFiles(@Param('orderId') orderId: string) {
    return this.filesService.listLaboratoryOrderFiles(orderId);
  }

  @Post('laboratory/orders/:orderId')
  @RequirePermissions('laboratory.manage')
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Laboratory order source file uploaded.' })
  uploadLaboratoryOrderFile(
    @Param('orderId') orderId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.filesService.uploadLaboratoryOrderFile(orderId, file, actor.id);
  }

  @Get('supply-invoices/:supplyInvoiceId')
  @RequirePermissions('stock.read')
  listSupplyFiles(@Param('supplyInvoiceId') supplyInvoiceId: string) {
    return this.filesService.listSupplyFiles(supplyInvoiceId);
  }

  @Post('supply-invoices/:supplyInvoiceId')
  @RequirePermissions('stock.manage')
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Supply document attachment uploaded.' })
  uploadSupplyFile(
    @Param('supplyInvoiceId') supplyInvoiceId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.filesService.uploadSupplyFile(supplyInvoiceId, file, actor.id);
  }

  @Get(':fileId/download')
  @RequireAnyPermissions('documents.read', 'laboratory.read', 'stock.read')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Private file stream.' })
  async download(
    @Param('fileId') fileId: string,
    @CurrentEmployee() actor: AuthEmployee,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { file, stream } = await this.filesService.download(fileId, actor);
    response.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    response.setHeader('Content-Disposition', contentDisposition(file.originalName));
    if (file.sizeBytes !== null) response.setHeader('Content-Length', String(file.sizeBytes));
    return new StreamableFile(stream);
  }

  @Delete(':fileId')
  @RequireAnyPermissions('documents.manage', 'laboratory.manage', 'stock.manage')
  @ApiOkResponse({ description: 'Attachment removed, audit metadata preserved.' })
  delete(@Param('fileId') fileId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.filesService.delete(fileId, actor);
  }
}

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'file';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
