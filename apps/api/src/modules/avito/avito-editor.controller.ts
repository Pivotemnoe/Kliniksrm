import { Body, Controller, Get, Header, Param, Patch, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions, RequireRoles } from '../auth/decorators/require-permissions.decorator';
import { AuthEmployee } from '../auth/auth.types';
import type { UploadedFilePayload } from '../files/files.service';
import { AvitoEditorService } from './avito-editor.service';
import { AvitoDraftVersionDto, CreateAvitoDraftDto, GenerateAvitoDraftDto, RestoreAvitoDraftDto, SaveAvitoDraftDto } from './dto/avito-editor.dto';

@Controller('v1/avito/editor')
@RequireRoles('director')
@RequirePermissions('avito.manage')
export class AvitoEditorController {
  constructor(private readonly editor: AvitoEditorService) {}
  @Get('catalog') catalog() { return this.editor.catalog(); }
  @Post('access/check') check(@CurrentEmployee() actor: AuthEmployee) { return this.editor.check(actor.id); }
  @Get('drafts') drafts() { return this.editor.list(); }
  @Post('drafts') create(@Body() dto: CreateAvitoDraftDto, @CurrentEmployee() actor: AuthEmployee) { return this.editor.create(dto, actor.id); }
  @Get('drafts/:id') draft(@Param('id') id: string) { return this.editor.get(id); }
  @Patch('drafts/:id') save(@Param('id') id: string, @Body() dto: SaveAvitoDraftDto, @CurrentEmployee() actor: AuthEmployee) { return this.editor.save(id, dto, actor.id); }
  @Post('drafts/:id/restore') restore(@Param('id') id: string, @Body() dto: RestoreAvitoDraftDto, @CurrentEmployee() actor: AuthEmployee) { return this.editor.restore(id, dto.version, dto.revision, actor.id); }
  @Post('drafts/:id/generate') generate(@Param('id') id: string, @Body() dto: GenerateAvitoDraftDto) { return this.editor.generate(id, dto); }
  @Post('drafts/:id/approve') approve(@Param('id') id: string, @Body() dto: AvitoDraftVersionDto, @CurrentEmployee() actor: AuthEmployee) { return this.editor.approve(id, dto.version, actor.id); }
  @Post('drafts/:id/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  upload(@Param('id') id: string, @Body() dto: AvitoDraftVersionDto, @UploadedFile() file: UploadedFilePayload | undefined, @CurrentEmployee() actor: AuthEmployee) { return this.editor.upload(id, dto.version, file, actor.id); }
  @Get('drafts/:id/photos/:photoId') @Header('Cache-Control', 'private, no-store') @Header('X-Content-Type-Options', 'nosniff')
  async photo(@Param('id') id: string, @Param('photoId') photoId: string, @Res({ passthrough: true }) response: Response) {
    const photo = await this.editor.media(id, photoId); response.setHeader('Content-Type', photo.mimeType); response.setHeader('Content-Length', String(photo.sizeBytes));
    return new StreamableFile(Buffer.from(photo.bytes));
  }
  @Get('drafts/:id/package') @Header('Cache-Control', 'private, no-store')
  async export(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const data = await this.editor.export(id); response.setHeader('Content-Type', 'application/zip'); response.setHeader('Content-Disposition', 'attachment; filename="avito-manual-package.zip"');
    return new StreamableFile(data);
  }
  @Post('drafts/:id/publish') publish() { return this.editor.publish(); }
}
