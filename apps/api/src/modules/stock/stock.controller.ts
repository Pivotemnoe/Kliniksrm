import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateSupplyInvoiceDto } from './dto/create-supply-invoice.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpsertProductDto } from './dto/upsert-product.dto';
import { UpsertServiceDto } from './dto/upsert-service.dto';
import { StockService } from './stock.service';

@ApiTags('stock')
@Controller('v1/stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('resources')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Warehouses, categories and suppliers.' })
  getResources(@CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.getResources(actor.id);
  }

  @Get('products')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Product catalog.' })
  listProducts(@Query() query: ListStockQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.listProducts(query, actor.id);
  }

  @Get('alerts')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Products with low stock rest.' })
  listStockAlerts(@Query() query: ListStockQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.listStockAlerts(query, actor.id);
  }

  @Post('products')
  @RequirePermissions('stock.manage')
  @ApiCreatedResponse({ description: 'Product created.' })
  createProduct(@Body() dto: UpsertProductDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.createProduct(dto, actor.id);
  }

  @Get('products/:productId')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Product card.' })
  getProduct(@Param('productId') productId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.getProduct(productId, actor.id);
  }

  @Patch('products/:productId')
  @RequirePermissions('stock.manage')
  @ApiOkResponse({ description: 'Product updated.' })
  updateProduct(@Param('productId') productId: string, @Body() dto: UpdateProductDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.updateProduct(productId, dto, actor.id);
  }

  @Get('services')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Service catalog.' })
  listServices(@Query() query: ListStockQueryDto) {
    return this.stockService.listServices(query);
  }

  @Post('services')
  @RequirePermissions('stock.manage')
  @ApiCreatedResponse({ description: 'Service created.' })
  createService(@Body() dto: UpsertServiceDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.createService(dto, actor.id);
  }

  @Get('services/:serviceId')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Service card.' })
  getService(@Param('serviceId') serviceId: string) {
    return this.stockService.getService(serviceId);
  }

  @Patch('services/:serviceId')
  @RequirePermissions('stock.manage')
  @ApiOkResponse({ description: 'Service updated.' })
  updateService(@Param('serviceId') serviceId: string, @Body() dto: UpdateServiceDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.updateService(serviceId, dto, actor.id);
  }

  @Get('batches')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Stock batches and rests.' })
  listStockBatches(@Query() query: ListStockQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.listStockBatches(query, actor.id);
  }

  @Get('supply-invoices')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Supply invoice list.' })
  listSupplyInvoices(@Query() query: ListStockQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.listSupplyInvoices(query, actor.id);
  }

  @Post('supply-invoices')
  @RequirePermissions('stock.manage')
  @ApiCreatedResponse({ description: 'Supply invoice received to stock.' })
  createSupplyInvoice(@Body() dto: CreateSupplyInvoiceDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.createSupplyInvoice(dto, actor.id);
  }

  @Get('supply-invoices/:supplyInvoiceId')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Supply invoice card.' })
  getSupplyInvoice(@Param('supplyInvoiceId') supplyInvoiceId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.stockService.getSupplyInvoice(supplyInvoiceId, actor.id);
  }
}
