import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
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
  getToday(@Query() query: DashboardQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.dashboardService.getToday(query, actor);
  }
}
