import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { OwnersService } from './owners.service';

@ApiTags('owners')
@Controller('v1/owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  @ApiOkResponse({ description: 'Owner list with patient counts.' })
  listOwners() {
    return this.ownersService.listOwners();
  }

  @Post()
  @ApiCreatedResponse({ description: 'Owner created.' })
  createOwner(@Body() dto: CreateOwnerDto) {
    return this.ownersService.createOwner(dto);
  }

  @Get(':ownerId')
  @ApiOkResponse({ description: 'Owner card.' })
  getOwner(@Param('ownerId') ownerId: string) {
    return this.ownersService.getOwner(ownerId);
  }

  @Get(':ownerId/animals')
  @ApiOkResponse({ description: 'Owner patients.' })
  listOwnerAnimals(@Param('ownerId') ownerId: string) {
    return this.ownersService.listOwnerAnimals(ownerId);
  }

  @Post(':ownerId/animals')
  @ApiCreatedResponse({ description: 'Animal created for owner.' })
  createAnimal(@Param('ownerId') ownerId: string, @Body() dto: CreateAnimalDto) {
    return this.ownersService.createAnimal({ ...dto, ownerId });
  }
}
