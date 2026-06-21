import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FinanceService } from './finance.service';
import { UpsertCashboxDto } from './dto/upsert-cashbox.dto';
import { UpsertPaymentMethodDto } from './dto/upsert-payment-method.dto';

@ApiTags('finance')
@Controller('v1/finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('settings')
  @RequirePermissions('settings.read')
  @ApiOkResponse({ description: 'Payment methods and cashboxes.' })
  getSettings() {
    return this.financeService.getSettings();
  }

  @Post('payment-methods')
  @RequirePermissions('settings.manage')
  @ApiCreatedResponse({ description: 'Payment method created.' })
  createPaymentMethod(@Body() dto: UpsertPaymentMethodDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.financeService.createPaymentMethod(dto, actor.id);
  }

  @Patch('payment-methods/:paymentMethodId')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Payment method updated.' })
  updatePaymentMethod(
    @Param('paymentMethodId') paymentMethodId: string,
    @Body() dto: UpsertPaymentMethodDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.financeService.updatePaymentMethod(paymentMethodId, dto, actor.id);
  }

  @Post('cashboxes')
  @RequirePermissions('settings.manage')
  @ApiCreatedResponse({ description: 'Cashbox created.' })
  createCashbox(@Body() dto: UpsertCashboxDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.financeService.createCashbox(dto, actor.id);
  }

  @Patch('cashboxes/:cashboxId')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Cashbox updated.' })
  updateCashbox(@Param('cashboxId') cashboxId: string, @Body() dto: UpsertCashboxDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.financeService.updateCashbox(cashboxId, dto, actor.id);
  }
}
