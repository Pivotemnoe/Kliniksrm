import { Body, Controller, Delete, Get, Header, Patch, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { UploadedFilePayload } from '../files/files.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationService } from './organization.service';

@ApiTags('organization')
@Controller('v1/organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @RequirePermissions('settings.read')
  @ApiOkResponse({ description: 'Current clinic organization.' })
  getOrganization() {
    return this.organizationService.getOrganization();
  }

  @Patch()
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Clinic organization updated.' })
  updateOrganization(@Body() dto: UpdateOrganizationDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.organizationService.updateOrganization(dto, actor.id);
  }

  @Get('logo')
  @RequirePermissions('settings.read')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Current organization logo.' })
  async getLogo(@Res({ passthrough: true }) response: Response) {
    const logo = await this.organizationService.getOrganizationLogo();
    response.setHeader('Content-Type', logo.mimeType);
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(logo.originalName)}`);
    if (logo.sizeBytes !== null) response.setHeader('Content-Length', String(logo.sizeBytes));
    return new StreamableFile(logo.stream);
  }

  @Post('logo')
  @RequirePermissions('settings.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Organization logo uploaded.' })
  uploadLogo(@UploadedFile() file: UploadedFilePayload | undefined, @CurrentEmployee() actor: AuthEmployee) {
    return this.organizationService.uploadOrganizationLogo(file, actor.id);
  }

  @Delete('logo')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Organization logo removed.' })
  deleteLogo(@CurrentEmployee() actor: AuthEmployee) {
    return this.organizationService.deleteOrganizationLogo(actor.id);
  }
}
