import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequireAnyPermissions, RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@Controller('v1/employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequireAnyPermissions('employees.read', 'employees.manage')
  @ApiOkResponse({ description: 'Employee list.' })
  listEmployees() {
    return this.employeesService.listEmployees();
  }

  @Post()
  @RequirePermissions('employees.manage', 'roles.manage')
  @ApiCreatedResponse({ description: 'Employee created by director-level access.' })
  createEmployee(@Body() dto: CreateEmployeeDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.employeesService.createEmployee(dto, actor.id);
  }

  @Get(':employeeId')
  @RequireAnyPermissions('employees.read', 'employees.manage')
  @ApiOkResponse({ description: 'Employee card.' })
  getEmployee(@Param('employeeId') employeeId: string) {
    return this.employeesService.getEmployee(employeeId);
  }

  @Patch(':employeeId')
  @RequirePermissions('employees.manage', 'roles.manage')
  @ApiOkResponse({ description: 'Employee updated by director-level access.' })
  updateEmployee(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.employeesService.updateEmployee(employeeId, dto, actor.id);
  }
}
