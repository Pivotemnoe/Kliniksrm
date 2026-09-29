import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RequireAnyPermissions } from '../auth/decorators/require-permissions.decorator';
import { AddressesService } from './addresses.service';

class AddressQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  q?: string;
}

@Controller('v1/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get('suggest')
  @RequireAnyPermissions('owners.read', 'owners.manage', 'queue.manage', 'organization.manage', 'settings.manage')
  suggest(@Query() query: AddressQueryDto) {
    return this.addresses.suggest(query.q ?? '');
  }
}
