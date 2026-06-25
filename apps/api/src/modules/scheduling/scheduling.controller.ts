import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateEmployeeShiftDto } from './dto/create-employee-shift.dto';
import { CreateClinicOfficeDto } from './dto/create-clinic-office.dto';
import { CreateSchedulingResourceDto } from './dto/create-scheduling-resource.dto';
import { ListEmployeeShiftsQueryDto } from './dto/list-employee-shifts-query.dto';
import { UpdateClinicOfficeDto } from './dto/update-clinic-office.dto';
import { UpdateEmployeeShiftDto } from './dto/update-employee-shift.dto';
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

  @Post('offices')
  @RequirePermissions('settings.manage')
  @ApiCreatedResponse({ description: 'Clinic office created.' })
  createOffice(@Body() dto: CreateClinicOfficeDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.schedulingService.createOffice(dto, actor.id);
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

  @Get('employee-shifts')
  @RequirePermissions('appointments.read')
  @ApiOkResponse({ description: 'Employee work shifts for appointment planning and login control.' })
  listEmployeeShifts(@Query() query: ListEmployeeShiftsQueryDto) {
    return this.schedulingService.listEmployeeShifts(query);
  }

  @Post('employee-shifts')
  @RequirePermissions('appointments.manage')
  @ApiCreatedResponse({ description: 'Employee work shift created.' })
  createEmployeeShift(@Body() dto: CreateEmployeeShiftDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.schedulingService.createEmployeeShift(dto, actor.id);
  }

  @Patch('employee-shifts/:shiftId')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Employee work shift updated.' })
  updateEmployeeShift(
    @Param('shiftId') shiftId: string,
    @Body() dto: UpdateEmployeeShiftDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.schedulingService.updateEmployeeShift(shiftId, dto, actor.id);
  }

  @Delete('employee-shifts/:shiftId')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Employee work shift disabled.' })
  disableEmployeeShift(@Param('shiftId') shiftId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.schedulingService.disableEmployeeShift(shiftId, actor.id);
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
