import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AcceptServerDto } from './dto/accept-server.dto';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { DiagnosticConsentDto } from './dto/diagnostic-consent.dto';
import { ImportAcceptanceReportDto } from './dto/import-acceptance-report.dto';
import { ImportLicenseDto } from './dto/import-license.dto';
import { UpdateSupportRequestDto } from './dto/update-support-request.dto';
import { SupportService } from './support.service';

@ApiTags('support-license-acceptance')
@Controller('v1/support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @RequirePermissions('support.read')
  @ApiOkResponse({ description: 'Director support, license and server acceptance overview.' })
  getOverview() {
    return this.support.getOverview();
  }

  @Post('requests')
  @RequirePermissions('support.manage')
  @ApiCreatedResponse({ description: 'Support request saved in the clinic request log.' })
  createRequest(@Body() dto: CreateSupportRequestDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.support.createRequest(dto, actor);
  }

  @Patch('requests/:requestId')
  @RequirePermissions('support.manage')
  updateRequest(@Param('requestId') requestId: string, @Body() dto: UpdateSupportRequestDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.support.updateRequest(requestId, dto, actor);
  }

  @Post('diagnostics')
  @RequirePermissions('support.manage')
  exportDiagnostics(@Body() _dto: DiagnosticConsentDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.support.exportSafeDiagnostics(actor);
  }

  @Post('license')
  @RequirePermissions('license.manage')
  importLicense(@Body() dto: ImportLicenseDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.support.importLicense(dto, actor);
  }

  @Post('acceptance')
  @RequirePermissions('acceptance.manage')
  importAcceptance(@Body() dto: ImportAcceptanceReportDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.support.importAcceptanceReport(dto, actor);
  }

  @Post('acceptance/:acceptanceId/accept')
  @RequirePermissions('acceptance.manage')
  acceptServer(@Param('acceptanceId') acceptanceId: string, @Body() dto: AcceptServerDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.support.acceptServer(acceptanceId, dto, actor);
  }
}
