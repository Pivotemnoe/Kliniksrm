import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AdmitHospitalPatientDto } from './dto/admit-hospital-patient.dto';
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

  @Get(':visitId')
  @RequirePermissions('hospital.read')
  @ApiOkResponse({ description: 'Hospital stay card.' })
  getHospitalStay(@Param('visitId') visitId: string) {
    return this.hospitalService.getHospitalStay(visitId);
  }

  @Patch(':visitId')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'Hospital stay updated.' })
  updateStay(@Param('visitId') visitId: string, @Body() dto: UpdateHospitalStayDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.hospitalService.updateStay(visitId, dto, actor.id);
  }

  @Post(':visitId/discharge')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'Patient discharged from hospital.' })
  discharge(@Param('visitId') visitId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.hospitalService.discharge(visitId, actor.id);
  }

  @Post(':visitId/cancel')
  @RequirePermissions('hospital.manage')
  @ApiOkResponse({ description: 'Hospital stay cancelled.' })
  cancel(@Param('visitId') visitId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.hospitalService.cancel(visitId, actor.id);
  }
}
