import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('dashboard')
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('today')
  @RequirePermissions('dashboard.read')
  @ApiOkResponse({ description: 'Рабочая сводка клиники на выбранный день.' })
  getToday(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getToday(query);
  }
}
