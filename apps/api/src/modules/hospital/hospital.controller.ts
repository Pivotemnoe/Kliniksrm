import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AdmitHospitalPatientDto } from './dto/admit-hospital-patient.dto';
import { AdmitExistingHospitalStayDto } from './dto/admit-existing-hospital-stay.dto';
import { CreateHospitalRecordDto } from './dto/create-hospital-record.dto';
import { ListHospitalQueryDto } from './dto/list-hospital-query.dto';
import { UpdateHospitalStayDto } from './dto/update-hospital-stay.dto';
import { HospitalService } from './hospital.service';

@ApiTags('hospital')
@Controller('v1/hospital')
export class HospitalController {
  constructor(private readonly hospitalService: HospitalService) {}

  @Get()
  @RequirePermissions('hospital.read')
  @ApiOkResponse({ description: 'Hospital patient list.' })
  listHospital(@Query() query: ListHospitalQueryDto) {
    return this.hospitalService.listHospital(query);
  }

  @Get('resources')
  @RequirePermissions('hospital.read')
  @ApiOkResponse({ description: 'Hospital boxes.' })
  getResources() {
    return this.hospitalService.getResources();
  }

  @Post()
  @RequirePermissions('hospital.manage')
  @ApiCreatedResponse({ description: 'Patient admitted to hospital.' })
  admit(@Body() dto: AdmitHospitalPatientDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.hospitalService.admit(dto, actor.id);
  }

  @Get(':stayId')
  @RequirePermissions('hospital.read')
  @ApiOkResponse({ description: 'Hospital stay card.' })
  getHospitalStay(@Param('stayId') stayId: string) {
    return this.hospitalService.getHospitalStay(stayId);
  }

  @Post(':visitId/admit')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'Existing active visit admitted to hospital.' })
  admitExisting(
    @Param('visitId') visitId: string,
    @Body() dto: AdmitExistingHospitalStayDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.hospitalService.admitExisting(visitId, dto, actor.id);
  }

  @Post(':stayId/records')
  @RequirePermissions('hospital.manage')
  @ApiCreatedResponse({ description: 'A timestamped hospital journal record.' })
  createRecord(
    @Param('stayId') stayId: string,
    @Body() dto: CreateHospitalRecordDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.hospitalService.createRecord(stayId, dto, actor.id);
  }

  @Patch(':stayId')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'Hospital stay updated.' })
  updateStay(@Param('stayId') stayId: string, @Body() dto: UpdateHospitalStayDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.hospitalService.updateStay(stayId, dto, actor.id);
  }

  @Post(':stayId/discharge')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'Patient discharged from hospital.' })
  discharge(@Param('stayId') stayId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.hospitalService.discharge(stayId, actor.id);
  }

  @Post(':stayId/cancel')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'Hospital stay cancelled.' })
  cancel(@Param('stayId') stayId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.hospitalService.cancel(stayId, actor.id);
  }
}
