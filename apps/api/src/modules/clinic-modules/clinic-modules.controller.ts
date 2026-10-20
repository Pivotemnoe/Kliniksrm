import { Body, Controller, ForbiddenException, Get, Param, Patch } from '@nestjs/common';
import { IsBoolean, IsInt, Min } from 'class-validator';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequireAnyPermissions, RequirePermissions, RequireRoles } from '../auth/decorators/require-permissions.decorator';
import { ClinicModulesService } from './clinic-modules.service';
import { AVITO_MODULE_KEY } from '../avito/avito.settings';

class UpdateModuleDto { @IsBoolean() enabled: boolean; @IsInt() @Min(0) version: number; }
@Controller('v1/clinic-modules')
@RequireRoles('director')
@RequireAnyPermissions('modules.manage', 'avito.manage')
export class ClinicModulesController {
  constructor(private readonly modules: ClinicModulesService) {}
  @Get('availability') @RequireRoles() @RequirePermissions() @RequireAnyPermissions('grooming.read', 'modules.manage', 'avito.read', 'avito.manage')
  availability() { return this.modules.availability(); }
  @Get() catalog() { return this.modules.catalog(); }
  @Patch(':key') update(@Param('key') key: string, @Body() dto: UpdateModuleDto, @CurrentEmployee() actor: { id: string; permissions: string[] }) {
    const permission = key === AVITO_MODULE_KEY ? 'avito.manage' : 'modules.manage';
    if (!actor.permissions.includes(permission)) throw new ForbiddenException('Нет права изменять этот модуль');
    return this.modules.setEnabled(key, dto.enabled, dto.version, actor.id);
  }
}
