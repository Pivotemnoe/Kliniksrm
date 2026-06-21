import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationService } from './organization.service';

@ApiTags('organization')
@Controller('v1/organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @RequirePermissions('settings.read')
  @ApiOkResponse({ description: 'Current clinic organization.' })
  getOrganization() {
    return this.organizationService.getOrganization();
  }

  @Patch()
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Clinic organization updated.' })
  updateOrganization(@Body() dto: UpdateOrganizationDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.organizationService.updateOrganization(dto, actor.id);
  }
}
