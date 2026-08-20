import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ListStoreProductsDto } from './dto/list-store-products.dto';
import { ImportStoreProductsDto, UpdateStoreProductDto, UpsertStoreProductDto } from './dto/upsert-store-product.dto';
import { StoreService } from './store.service';

@ApiTags('store')
@Controller('v1/store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('resources')
  @RequirePermissions('store.read')
  getResources() {
    return this.storeService.getResources();
  }

  @Get('products')
  @RequirePermissions('store.read')
  @ApiOkResponse({ description: 'Isolated store product catalog.' })
  listProducts(@Query() query: ListStoreProductsDto) {
    return this.storeService.listProducts(query);
  }

  @Post('products')
  @RequirePermissions('store.manage')
  @ApiCreatedResponse({ description: 'Store product created without changing clinic stock or finance.' })
  createProduct(@Body() dto: UpsertStoreProductDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.storeService.createProduct(dto, actor.id);
  }

  @Patch('products/:productId')
  @RequirePermissions('store.manage')
  updateProduct(@Param('productId') productId: string, @Body() dto: UpdateStoreProductDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.storeService.updateProduct(productId, dto, actor.id);
  }

  @Delete('products/:productId')
  @RequirePermissions('store.manage')
  archiveProduct(@Param('productId') productId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.storeService.archiveProduct(productId, actor.id);
  }

  @Post('products/import')
  @RequirePermissions('store.manage')
  importProducts(@Body() dto: ImportStoreProductsDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.storeService.importProducts(dto, actor.id);
  }
}
