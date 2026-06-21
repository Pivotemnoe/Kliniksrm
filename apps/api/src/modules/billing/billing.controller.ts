import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AddBillItemDto } from './dto/add-bill-item.dto';
import { CreateBillDto } from './dto/create-bill.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListBillsQueryDto } from './dto/list-bills-query.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { UpdateBillItemDto } from './dto/update-bill-item.dto';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('v1/bills')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  @RequirePermissions('billing.read')
  @ApiOkResponse({ description: 'Bill list.' })
  listBills(@Query() query: ListBillsQueryDto) {
    return this.billingService.listBills(query);
  }

  @Get('alerts')
  @RequirePermissions('billing.read')
  @ApiOkResponse({ description: 'Bills with unpaid debt.' })
  listBillAlerts(@Query() query: ListBillsQueryDto) {
    return this.billingService.listBillAlerts(query);
  }

  @Post()
  @RequirePermissions('billing.manage')
  @ApiCreatedResponse({ description: 'Manual bill created.' })
  createBill(@Body() dto: CreateBillDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.billingService.createBill(dto, actor.id);
  }

  @Get(':billId')
  @RequirePermissions('billing.read')
  @ApiOkResponse({ description: 'Bill card.' })
  getBill(@Param('billId') billId: string) {
    return this.billingService.getBill(billId);
  }

  @Patch(':billId')
  @RequirePermissions('billing.manage')
  @ApiOkResponse({ description: 'Bill updated.' })
  updateBill(@Param('billId') billId: string, @Body() dto: UpdateBillDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.billingService.updateBill(billId, dto, actor.id);
  }

  @Post(':billId/cancel')
  @RequirePermissions('billing.manage')
  @ApiOkResponse({ description: 'Unpaid bill cancelled.' })
  cancelBill(@Param('billId') billId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.billingService.cancelBill(billId, actor.id);
  }

  @Post(':billId/reopen')
  @RequirePermissions('billing.manage')
  @ApiOkResponse({ description: 'Cancelled bill reopened and recalculated.' })
  reopenBill(@Param('billId') billId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.billingService.reopenBill(billId, actor.id);
  }

  @Post(':billId/items')
  @RequirePermissions('billing.manage')
  @ApiCreatedResponse({ description: 'Bill item created.' })
  addBillItem(@Param('billId') billId: string, @Body() dto: AddBillItemDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.billingService.addBillItem(billId, dto, actor.id);
  }

  @Patch(':billId/items/:billItemId')
  @RequirePermissions('billing.manage')
  @ApiOkResponse({ description: 'Bill item updated.' })
  updateBillItem(
    @Param('billId') billId: string,
    @Param('billItemId') billItemId: string,
    @Body() dto: UpdateBillItemDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.billingService.updateBillItem(billId, billItemId, dto, actor.id);
  }

  @Delete(':billId/items/:billItemId')
  @RequirePermissions('billing.manage')
  @ApiOkResponse({ description: 'Bill item deleted.' })
  deleteBillItem(
    @Param('billId') billId: string,
    @Param('billItemId') billItemId: string,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.billingService.deleteBillItem(billId, billItemId, actor.id);
  }

  @Get(':billId/payments')
  @RequirePermissions('billing.read')
  @ApiOkResponse({ description: 'Bill payment list.' })
  listPayments(@Param('billId') billId: string) {
    return this.billingService.listPayments(billId);
  }

  @Post(':billId/payments')
  @RequirePermissions('payments.manage')
  @ApiCreatedResponse({ description: 'Payment accepted.' })
  createPayment(@Param('billId') billId: string, @Body() dto: CreatePaymentDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.billingService.createPayment(billId, dto, actor.id);
  }

  @Post(':billId/payments/:paymentId/refund')
  @RequirePermissions('payments.manage')
  @ApiCreatedResponse({ description: 'Payment refund recorded.' })
  refundPayment(
    @Param('billId') billId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: RefundPaymentDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.billingService.refundPayment(billId, paymentId, dto, actor.id);
  }
}
