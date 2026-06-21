import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
