import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { EmployeesService } from './employees.service';

@ApiTags('roles')
@Controller('v1/roles')
export class RolesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('employees.read')
  @ApiOkResponse({ description: 'Available employee roles and permissions.' })
  listRoles() {
    return this.employeesService.listRoles();
  }
}

