import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyPermissions } from '../auth/decorators/require-permissions.decorator';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @RequireAnyPermissions('settings.read', 'settings.manage')
  @ApiOkResponse({ description: 'Управленческий отчёт клиники за выбранный период.' })
  getSummary(@Query() query: ReportQueryDto) {
    return this.reportsService.getSummary(query);
  }
}
