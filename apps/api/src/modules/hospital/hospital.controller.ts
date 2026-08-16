import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AdmitHospitalPatientDto } from './dto/admit-hospital-patient.dto';
import { AdmitExistingHospitalStayDto } from './dto/admit-existing-hospital-stay.dto';
import { CancelHospitalRecordsDto } from './dto/cancel-hospital-records.dto';
import { CreateHospitalAmendmentDto } from './dto/create-hospital-amendment.dto';
import { CreateHospitalRecordDto } from './dto/create-hospital-record.dto';
import { CreateHospitalTreatmentPlanDto } from './dto/create-hospital-treatment-plan.dto';
import { ListHospitalQueryDto } from './dto/list-hospital-query.dto';
import { UpdateHospitalStayDto } from './dto/update-hospital-stay.dto';
import { UpdateHospitalRecordDto } from './dto/update-hospital-record.dto';
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

  @Get('catalog')
  @RequirePermissions('hospital.read')
  @ApiOkResponse({ description: 'Products and services available for hospital records.' })
  getCatalog(@Query('search') search: string | undefined, @CurrentEmployee() actor: AuthEmployee) {
    return this.hospitalService.getCatalog(search, actor.id);
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

  @Post(':stayId/treatment-plans')
  @RequirePermissions('hospital.manage')
  @ApiCreatedResponse({ description: 'A multi-item treatment plan expanded into dated hospital records.' })
  createTreatmentPlan(
    @Param('stayId') stayId: string,
    @Body() dto: CreateHospitalTreatmentPlanDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.hospitalService.createTreatmentPlan(stayId, dto, actor.id);
  }

  @Patch(':stayId/records/:recordId')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'Hospital journal record updated with an audit trail.' })
  updateRecord(
    @Param('stayId') stayId: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateHospitalRecordDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.hospitalService.updateRecord(stayId, recordId, dto, actor.id);
  }

  @Post(':stayId/records/:recordId/cancel')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'One planned execution or its remaining series cancelled.' })
  cancelRecords(
    @Param('stayId') stayId: string,
    @Param('recordId') recordId: string,
    @Body() dto: CancelHospitalRecordsDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.hospitalService.cancelRecords(stayId, recordId, dto, actor.id);
  }

  @Post(':stayId/records/:recordId/amendments')
  @RequirePermissions('hospital.manage')
  @ApiCreatedResponse({ description: 'Append-only amendment for a locked hospital journal record.' })
  createAmendment(
    @Param('stayId') stayId: string,
    @Param('recordId') recordId: string,
    @Body() dto: CreateHospitalAmendmentDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.hospitalService.createAmendment(stayId, recordId, dto, actor.id);
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
