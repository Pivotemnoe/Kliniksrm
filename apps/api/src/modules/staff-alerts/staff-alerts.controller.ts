import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { StaffAlertsService } from './staff-alerts.service';

@ApiTags('staff-alerts')
@Controller('v1/staff-alerts')
export class StaffAlertsController {
  constructor(private readonly staffAlertsService: StaffAlertsService) {}

  @Get()
  @ApiOkResponse({ description: 'Role-aware active staff alerts with per-employee read state.' })
  list(@CurrentEmployee() actor: AuthEmployee) {
    return this.staffAlertsService.list(actor);
  }

  @Post('read-all')
  @AllowRemoteMutation()
  @ApiOkResponse({ description: 'All currently visible staff alerts marked as read.' })
  markAllRead(@CurrentEmployee() actor: AuthEmployee) {
    return this.staffAlertsService.markAllRead(actor);
  }

  @Post(':alertKey/read')
  @AllowRemoteMutation()
  @ApiOkResponse({ description: 'One currently visible staff alert marked as read.' })
  markRead(@Param('alertKey') alertKey: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.staffAlertsService.markRead(alertKey, actor);
  }
}
