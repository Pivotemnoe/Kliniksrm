import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { CreateTrustedPersonDto } from './dto/create-trusted-person.dto';
import { ListOwnersQueryDto } from './dto/list-owners-query.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { UpdateTrustedPersonDto } from './dto/update-trusted-person.dto';
import { OwnersService } from './owners.service';

@ApiTags('owners')
@Controller('v1/owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  @RequirePermissions('owners.read')
  @ApiOkResponse({ description: 'Owner list with patient counts.' })
  listOwners(@Query() query: ListOwnersQueryDto) {
    return this.ownersService.listOwners(query);
  }

  @Post()
  @RequirePermissions('owners.manage')
  @ApiCreatedResponse({ description: 'Owner created.' })
  createOwner(@Body() dto: CreateOwnerDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.ownersService.createOwner(dto, actor.id);
  }

  @Get(':ownerId')
  @RequirePermissions('owners.read')
  @ApiOkResponse({ description: 'Owner card.' })
  getOwner(@Param('ownerId') ownerId: string) {
    return this.ownersService.getOwner(ownerId);
  }

  @Patch(':ownerId')
  @RequirePermissions('owners.manage')
  @ApiOkResponse({ description: 'Owner updated.' })
  updateOwner(@Param('ownerId') ownerId: string, @Body() dto: UpdateOwnerDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.ownersService.updateOwner(ownerId, dto, actor.id);
  }

  @Get(':ownerId/animals')
  @RequirePermissions('animals.read')
  @ApiOkResponse({ description: 'Owner patients.' })
  listOwnerAnimals(@Param('ownerId') ownerId: string) {
    return this.ownersService.listOwnerAnimals(ownerId);
  }

  @Post(':ownerId/animals')
  @RequirePermissions('animals.manage')
  @ApiCreatedResponse({ description: 'Animal created for owner.' })
  createAnimal(@Param('ownerId') ownerId: string, @Body() dto: CreateAnimalDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.ownersService.createAnimal({ ...dto, ownerId }, actor.id);
  }

  @Get(':ownerId/trusted-people')
  @RequirePermissions('owners.read')
  @ApiOkResponse({ description: 'Owner trusted people.' })
  listTrustedPeople(@Param('ownerId') ownerId: string) {
    return this.ownersService.listTrustedPeople(ownerId);
  }

  @Post(':ownerId/trusted-people')
  @RequirePermissions('owners.manage')
  @ApiCreatedResponse({ description: 'Trusted person created.' })
  createTrustedPerson(
    @Param('ownerId') ownerId: string,
    @Body() dto: CreateTrustedPersonDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.ownersService.createTrustedPerson(ownerId, dto, actor.id);
  }

  @Patch(':ownerId/trusted-people/:trustedPersonId')
  @RequirePermissions('owners.manage')
  @ApiOkResponse({ description: 'Trusted person updated.' })
  updateTrustedPerson(
    @Param('ownerId') ownerId: string,
    @Param('trustedPersonId') trustedPersonId: string,
    @Body() dto: UpdateTrustedPersonDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.ownersService.updateTrustedPerson(ownerId, trustedPersonId, dto, actor.id);
  }
}
