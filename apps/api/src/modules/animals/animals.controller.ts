import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AnimalsService } from './animals.service';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CreateWeightRecordDto } from './dto/create-weight-record.dto';
import { ListAnimalsQueryDto } from './dto/list-animals-query.dto';
import { UpdateAnimalDto } from './dto/update-animal.dto';
import { UpdateVaccinationDto } from './dto/update-vaccination.dto';

@ApiTags('animals')
@Controller('v1/animals')
export class AnimalsController {
  constructor(private readonly animalsService: AnimalsService) {}

  @Get()
  @RequirePermissions('animals.read')
  @ApiOkResponse({ description: 'Patient list.' })
  listAnimals(@Query() query: ListAnimalsQueryDto) {
    return this.animalsService.listAnimals(query);
  }

  @Get('catalog')
  @Public()
  @ApiOkResponse({ description: 'Species and breed catalog.' })
  listCatalog() {
    return this.animalsService.listCatalog();
  }

  @Get(':animalId')
  @RequirePermissions('animals.read')
  @ApiOkResponse({ description: 'Patient card.' })
  getAnimal(@Param('animalId') animalId: string) {
    return this.animalsService.getAnimal(animalId);
  }

  @Patch(':animalId')
  @RequirePermissions('animals.manage')
  @ApiOkResponse({ description: 'Patient updated.' })
  updateAnimal(@Param('animalId') animalId: string, @Body() dto: UpdateAnimalDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.animalsService.updateAnimal(animalId, dto, actor.id);
  }

  @Get(':animalId/weights')
  @RequirePermissions('animals.read')
  @ApiOkResponse({ description: 'Patient weight history.' })
  listWeightRecords(@Param('animalId') animalId: string) {
    return this.animalsService.listWeightRecords(animalId);
  }

  @Post(':animalId/weights')
  @RequirePermissions('animals.manage')
  @ApiCreatedResponse({ description: 'Patient weight record created.' })
  createWeightRecord(
    @Param('animalId') animalId: string,
    @Body() dto: CreateWeightRecordDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.animalsService.createWeightRecord(animalId, dto, actor.id);
  }

  @Get(':animalId/vaccinations')
  @RequirePermissions('animals.read')
  @ApiOkResponse({ description: 'Patient vaccination history.' })
  listVaccinations(@Param('animalId') animalId: string) {
    return this.animalsService.listVaccinations(animalId);
  }

  @Post(':animalId/vaccinations')
  @RequirePermissions('animals.manage')
  @ApiCreatedResponse({ description: 'Vaccination created.' })
  createVaccination(
    @Param('animalId') animalId: string,
    @Body() dto: CreateVaccinationDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.animalsService.createVaccination(animalId, dto, actor.id);
  }

  @Patch(':animalId/vaccinations/:vaccinationId')
  @RequirePermissions('animals.manage')
  @ApiOkResponse({ description: 'Vaccination updated.' })
  updateVaccination(
    @Param('animalId') animalId: string,
    @Param('vaccinationId') vaccinationId: string,
    @Body() dto: UpdateVaccinationDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.animalsService.updateVaccination(animalId, vaccinationId, dto, actor.id);
  }
}
