import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@Controller('v1/sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermissions('billing.read')
  @ApiOkResponse({ description: 'Sale list.' })
  listSales(@Query() query: ListSalesQueryDto) {
    return this.salesService.listSales(query);
  }

  @Post()
  @RequirePermissions('billing.manage')
  @ApiCreatedResponse({ description: 'Sale created with bill.' })
  createSale(@Body() dto: CreateSaleDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.salesService.createSale(dto, actor.id);
  }

  @Get(':saleId')
  @RequirePermissions('billing.read')
  @ApiOkResponse({ description: 'Sale card.' })
  getSale(@Param('saleId') saleId: string) {
    return this.salesService.getSale(saleId);
  }
}
