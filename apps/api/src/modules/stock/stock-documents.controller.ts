import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateStockDocumentDto } from './dto/create-stock-document.dto';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { ListStockDocumentsQueryDto } from './dto/list-stock-documents-query.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { UpdateStockDocumentDto } from './dto/update-stock-document.dto';
import { StockDocumentsService } from './stock-documents.service';

@ApiTags('stock-documents')
@Controller('v1/stock')
export class StockDocumentsController {
  constructor(private readonly documentsService: StockDocumentsService) {}

  @Get('documents')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Stock operation documents.' })
  listDocuments(@Query() query: ListStockDocumentsQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.documentsService.listDocuments(query, actor.id);
  }

  @Post('documents')
  @RequirePermissions('stock.manage')
  @ApiCreatedResponse({ description: 'Draft stock document created.' })
  createDocument(@Body() dto: CreateStockDocumentDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.documentsService.createDocument(dto, actor.id);
  }

  @Patch('documents/:documentId')
  @RequirePermissions('stock.manage')
  @ApiOkResponse({ description: 'Draft stock document updated.' })
  updateDocument(
    @Param('documentId') documentId: string,
    @Body() dto: UpdateStockDocumentDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.documentsService.updateDocument(documentId, dto, actor.id);
  }

  @Get('documents/:documentId')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Stock document details.' })
  getDocument(@Param('documentId') documentId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.documentsService.getDocument(documentId, actor.id);
  }

  @Post('documents/:documentId/post')
  @RequirePermissions('stock.manage')
  @ApiOkResponse({ description: 'Stock document posted atomically.' })
  postDocument(@Param('documentId') documentId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.documentsService.postDocument(documentId, actor.id);
  }

  @Post('documents/:documentId/cancel')
  @RequirePermissions('stock.manage')
  @ApiOkResponse({ description: 'Draft stock document cancelled.' })
  cancelDocument(@Param('documentId') documentId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.documentsService.cancelDocument(documentId, actor.id);
  }

  @Get('movements')
  @RequirePermissions('stock.read')
  @ApiOkResponse({ description: 'Stock movement history.' })
  listMovements(@Query() query: ListStockQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.documentsService.listMovements(query, actor.id);
  }

  @Get('supplier-balances')
  @RequirePermissions('stock.manage')
  @ApiOkResponse({ description: 'Supplier supplies, returns, payments and balances.' })
  listSupplierBalances() {
    return this.documentsService.listSupplierBalances();
  }

  @Post('supplier-payments')
  @RequirePermissions('stock.manage')
  @ApiCreatedResponse({ description: 'Supplier payment registered.' })
  createSupplierPayment(@Body() dto: CreateSupplierPaymentDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.documentsService.createSupplierPayment(dto, actor.id);
  }
}
