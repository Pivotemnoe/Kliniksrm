import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateSchedulingResourceDto } from './dto/create-scheduling-resource.dto';
import { UpdateClinicOfficeDto } from './dto/update-clinic-office.dto';
import { UpdateSchedulingResourceDto } from './dto/update-scheduling-resource.dto';
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

  @Get('settings')
  @RequirePermissions('settings.read')
  @ApiOkResponse({ description: 'Clinic office resources for settings.' })
  getSettingsResources() {
    return this.schedulingService.getSettingsResources();
  }

  @Patch('offices/:officeId')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Clinic office updated.' })
  updateOffice(
    @Param('officeId') officeId: string,
    @Body() dto: UpdateClinicOfficeDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.schedulingService.updateOffice(officeId, dto, actor.id);
  }

  @Post('rooms')
  @RequirePermissions('settings.manage')
  @ApiCreatedResponse({ description: 'Room created.' })
  createRoom(@Body() dto: CreateSchedulingResourceDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.schedulingService.createRoom(dto, actor.id);
  }

  @Patch('rooms/:roomId')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Room updated.' })
  updateRoom(
    @Param('roomId') roomId: string,
    @Body() dto: UpdateSchedulingResourceDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.schedulingService.updateRoom(roomId, dto, actor.id);
  }

  @Post('hospital-boxes')
  @RequirePermissions('settings.manage')
  @ApiCreatedResponse({ description: 'Hospital box created.' })
  createHospitalBox(@Body() dto: CreateSchedulingResourceDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.schedulingService.createHospitalBox(dto, actor.id);
  }

  @Patch('hospital-boxes/:hospitalBoxId')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Hospital box updated.' })
  updateHospitalBox(
    @Param('hospitalBoxId') hospitalBoxId: string,
    @Body() dto: UpdateSchedulingResourceDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.schedulingService.updateHospitalBox(hospitalBoxId, dto, actor.id);
  }

  @Post('warehouses')
  @RequirePermissions('settings.manage')
  @ApiCreatedResponse({ description: 'Warehouse created.' })
  createWarehouse(@Body() dto: CreateSchedulingResourceDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.schedulingService.createWarehouse(dto, actor.id);
  }

  @Patch('warehouses/:warehouseId')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Warehouse updated.' })
  updateWarehouse(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: UpdateSchedulingResourceDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.schedulingService.updateWarehouse(warehouseId, dto, actor.id);
  }
}
