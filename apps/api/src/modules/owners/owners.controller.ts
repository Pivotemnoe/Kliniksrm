import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { OwnersService } from './owners.service';

@ApiTags('owners')
@Controller('v1/owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  @RequirePermissions('owners.read')
  @ApiOkResponse({ description: 'Owner list with patient counts.' })
  listOwners() {
    return this.ownersService.listOwners();
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
}
