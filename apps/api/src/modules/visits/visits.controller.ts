import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AddVisitServiceDto } from './dto/add-visit-service.dto';
import { CreateVisitDiagnosisDto } from './dto/create-visit-diagnosis.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { ListVisitsQueryDto } from './dto/list-visits-query.dto';
import { UpdateVisitDiagnosisDto } from './dto/update-visit-diagnosis.dto';
import { UpdateVisitServiceDto } from './dto/update-visit-service.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { UpsertVisitExamDto } from './dto/upsert-visit-exam.dto';
import { UpsertVisitRecommendationDto } from './dto/upsert-visit-recommendation.dto';
import { VisitsService } from './visits.service';

@ApiTags('visits')
@Controller('v1/visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get()
  @RequirePermissions('visits.read')
  @ApiOkResponse({ description: 'Clinical visit list.' })
  listVisits(@Query() query: ListVisitsQueryDto) {
    return this.visitsService.listVisits(query);
  }

  @Post()
  @RequirePermissions('visits.manage')
  @ApiCreatedResponse({ description: 'Clinical visit created.' })
  createVisit(@Body() dto: CreateVisitDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.visitsService.createVisit(dto, actor);
  }

  @Get(':visitId')
  @RequirePermissions('visits.read')
  @ApiOkResponse({ description: 'Clinical visit card.' })
  getVisit(@Param('visitId') visitId: string) {
    return this.visitsService.getVisit(visitId);
  }

  @Patch(':visitId')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Clinical visit updated.' })
  updateVisit(@Param('visitId') visitId: string, @Body() dto: UpdateVisitDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.visitsService.updateVisit(visitId, dto, actor.id);
  }

  @Post(':visitId/start')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Clinical visit moved to in-progress.' })
  startVisit(@Param('visitId') visitId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.visitsService.startVisit(visitId, actor.id);
  }

  @Post(':visitId/complete')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Clinical visit completed.' })
  completeVisit(@Param('visitId') visitId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.visitsService.completeVisit(visitId, actor.id);
  }

  @Post(':visitId/cancel')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Clinical visit cancelled.' })
  cancelVisit(@Param('visitId') visitId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.visitsService.cancelVisit(visitId, actor.id);
  }

  @Put(':visitId/exam')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Visit examination sheet saved.' })
  upsertExam(@Param('visitId') visitId: string, @Body() dto: UpsertVisitExamDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.visitsService.upsertExam(visitId, dto, actor.id);
  }

  @Put(':visitId/recommendation')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Visit recommendations saved.' })
  upsertRecommendation(
    @Param('visitId') visitId: string,
    @Body() dto: UpsertVisitRecommendationDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.visitsService.upsertRecommendation(visitId, dto, actor.id);
  }

  @Post(':visitId/diagnoses')
  @RequirePermissions('visits.manage')
  @ApiCreatedResponse({ description: 'Visit diagnosis created.' })
  createDiagnosis(
    @Param('visitId') visitId: string,
    @Body() dto: CreateVisitDiagnosisDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.visitsService.createDiagnosis(visitId, dto, actor.id);
  }

  @Patch(':visitId/diagnoses/:diagnosisId')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Visit diagnosis updated.' })
  updateDiagnosis(
    @Param('visitId') visitId: string,
    @Param('diagnosisId') diagnosisId: string,
    @Body() dto: UpdateVisitDiagnosisDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.visitsService.updateDiagnosis(visitId, diagnosisId, dto, actor.id);
  }

  @Delete(':visitId/diagnoses/:diagnosisId')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Visit diagnosis deleted.' })
  deleteDiagnosis(
    @Param('visitId') visitId: string,
    @Param('diagnosisId') diagnosisId: string,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.visitsService.deleteDiagnosis(visitId, diagnosisId, actor.id);
  }

  @Post(':visitId/services')
  @RequirePermissions('visits.manage')
  @ApiCreatedResponse({ description: 'Service added to visit bill.' })
  addService(@Param('visitId') visitId: string, @Body() dto: AddVisitServiceDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.visitsService.addService(visitId, dto, actor.id);
  }

  @Patch(':visitId/services/:billItemId')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Visit bill service updated.' })
  updateService(
    @Param('visitId') visitId: string,
    @Param('billItemId') billItemId: string,
    @Body() dto: UpdateVisitServiceDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.visitsService.updateService(visitId, billItemId, dto, actor.id);
  }

  @Delete(':visitId/services/:billItemId')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Visit bill service deleted.' })
  deleteService(
    @Param('visitId') visitId: string,
    @Param('billItemId') billItemId: string,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.visitsService.deleteService(visitId, billItemId, actor.id);
  }
}
