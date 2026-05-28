import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { SchedulingService } from './scheduling.service';

@ApiTags('scheduling')
@Controller('v1/scheduling')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get('resources')
  @RequirePermissions('appointments.read')
  @ApiOkResponse({ description: 'Employees, rooms and offices for queue and appointment forms.' })
  getResources() {
    return this.schedulingService.getResources();
  }
}

