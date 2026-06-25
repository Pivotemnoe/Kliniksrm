import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequireAnyPermissions } from '../auth/decorators/require-permissions.decorator';
import { VetafImportDto } from './dto/vetaf-import.dto';
import { ImportsService } from './imports.service';

@ApiTags('imports')
@Controller('v1/imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('vetaf/preview')
  @RequireAnyPermissions('owners.manage', 'stock.manage')
  @ApiOkResponse({ description: 'VetaF import preview.' })
  previewVetafImport(@Body() dto: VetafImportDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.importsService.previewVetafImport(dto, actor);
  }

  @Post('vetaf/commit')
  @RequireAnyPermissions('owners.manage', 'stock.manage')
  @ApiOkResponse({ description: 'VetaF import committed.' })
  commitVetafImport(@Body() dto: VetafImportDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.importsService.commitVetafImport(dto, actor);
  }
}
