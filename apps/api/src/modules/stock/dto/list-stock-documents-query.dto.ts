import { StockDocumentStatus, StockDocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class ListStockDocumentsQueryDto {
  @IsOptional()
  @IsEnum(StockDocumentType)
  type?: StockDocumentType;

  @IsOptional()
  @IsEnum(StockDocumentStatus)
  status?: StockDocumentStatus;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  offset?: string;
}
