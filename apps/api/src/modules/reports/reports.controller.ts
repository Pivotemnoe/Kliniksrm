import { Body, Controller, Get, Header, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PreventionReportsService } from './prevention-reports.service';
import { GeneratePreventionReportDto, PreventionSettingsDto } from './dto/prevention-report.dto';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyPermissions } from '../auth/decorators/require-permissions.decorator';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService, private readonly prevention: PreventionReportsService) {}

  @Get('prevention/settings') @RequireAnyPermissions('reports.prevention.read', 'reports.prevention.generate', 'settings.read', 'settings.manage')
  getPreventionSettings() { return this.prevention.getSettings(); }

  @Put('prevention/settings') @RequirePermissions('settings.manage')
  savePreventionSettings(@Body() input: PreventionSettingsDto, @CurrentEmployee() actor: AuthEmployee) { return this.prevention.saveSettings(input, actor.id); }

  @Get('prevention') @RequireAnyPermissions('reports.prevention.read', 'reports.prevention.generate', 'settings.read', 'settings.manage')
  listPreventionReports() { return this.prevention.list(); }

  @Post('prevention/generate') @RequireAnyPermissions('reports.prevention.generate', 'settings.manage')
  generatePreventionReport(@Body() input: GeneratePreventionReportDto, @CurrentEmployee() actor: AuthEmployee) { return this.prevention.generate(input.month, actor.id, input.regenerate); }

  @Get('prevention/:id/docx') @RequireAnyPermissions('reports.prevention.read', 'reports.prevention.generate', 'settings.read', 'settings.manage')
  async downloadPreventionReport(@Param('id') id: string, @CurrentEmployee() actor: AuthEmployee, @Res() response: Response) {
    const report = await this.prevention.document(id, actor.id);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    response.setHeader('Content-Disposition', `attachment; filename="prevention-${report.month}-v${report.revision}.docx"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(Buffer.from(report.document));
  }

  @Get('prevention/:id') @Header('Cache-Control', 'private, no-store') @RequireAnyPermissions('reports.prevention.read', 'reports.prevention.generate', 'settings.read', 'settings.manage')
  getPreventionReport(@Param('id') id: string) { return this.prevention.get(id); }

  @Get('summary')
  @RequirePermissions('business.read')
  @ApiOkResponse({ description: 'Управленческий отчёт клиники за выбранный период.' })
  getSummary(@Query() query: ReportQueryDto) {
    return this.reportsService.getSummary(query);
  }
}
