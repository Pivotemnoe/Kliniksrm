import { ConsumableBindingsController } from './consumable-bindings.controller';
import { ConsumableBindingsService } from './consumable-bindings.service';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StockController } from './stock.controller';
import { StockDocumentsController } from './stock-documents.controller';
import { StockDocumentsService } from './stock-documents.service';
import { StockService } from './stock.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ConsumableBindingsController, StockController, StockDocumentsController],
  providers: [ConsumableBindingsService, StockService, StockDocumentsService],
})
export class StockModule {}
