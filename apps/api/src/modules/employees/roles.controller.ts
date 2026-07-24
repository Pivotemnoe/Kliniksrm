import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyPermissions } from '../auth/decorators/require-permissions.decorator';
import { EmployeesService } from './employees.service';

@ApiTags('roles')
@Controller('v1/roles')
export class RolesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequireAnyPermissions('employees.read', 'employees.manage', 'roles.manage', 'tasks.manage')
  @ApiOkResponse({ description: 'Available employee roles and permissions.' })
  listRoles() {
    return this.employeesService.listRoles();
  }
}
