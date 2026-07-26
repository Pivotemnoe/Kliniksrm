import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpsertPayrollProfileDto } from './dto/upsert-payroll-profile.dto';
import { PayrollService } from './payroll.service';

@ApiTags('payroll')
@Controller('v1/payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('resources')
  @RequirePermissions('payroll.read')
  @ApiOkResponse({ description: 'Employees, payroll profiles and rule catalogs.' })
  getResources() {
    return this.payrollService.getResources();
  }

  @Put('profiles/:employeeId')
  @RequirePermissions('payroll.manage')
  @ApiOkResponse({ description: 'Employee payroll profile saved.' })
  upsertProfile(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpsertPayrollProfileDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.payrollService.upsertProfile(employeeId, dto, actor.id);
  }

  @Get('periods')
  @RequirePermissions('payroll.read')
  @ApiOkResponse({ description: 'Payroll periods.' })
  listPeriods() {
    return this.payrollService.listPeriods();
  }

  @Post('periods')
  @RequirePermissions('payroll.manage')
  @ApiCreatedResponse({ description: 'Draft payroll period calculated.' })
  createPeriod(@Body() dto: CreatePayrollPeriodDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.payrollService.createPeriod(dto, actor.id);
  }

  @Get('periods/:periodId')
  @RequirePermissions('payroll.read')
  @ApiOkResponse({ description: 'Payroll period details.' })
  getPeriod(@Param('periodId') periodId: string) {
    return this.payrollService.getPeriod(periodId);
  }

  @Post('periods/:periodId/recalculate')
  @RequirePermissions('payroll.manage')
  @ApiOkResponse({ description: 'Draft payroll period recalculated.' })
  recalculatePeriod(@Param('periodId') periodId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.payrollService.recalculatePeriod(periodId, actor.id);
  }

  @Post('periods/:periodId/adjustments')
  @RequirePermissions('payroll.manage')
  @ApiCreatedResponse({ description: 'Manual payroll adjustment added.' })
  addAdjustment(
    @Param('periodId') periodId: string,
    @Body() dto: CreatePayrollAdjustmentDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.payrollService.addAdjustment(periodId, dto, actor.id);
  }

  @Post('periods/:periodId/approve')
  @RequirePermissions('payroll.approve')
  @ApiOkResponse({ description: 'Payroll period approved and locked.' })
  approvePeriod(@Param('periodId') periodId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.payrollService.approvePeriod(periodId, actor.id);
  }
}
