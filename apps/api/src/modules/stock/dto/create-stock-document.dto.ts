import { StockDocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class CreateStockDocumentItemDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  targetProductId?: string;

  @IsOptional()
  @IsUUID()
  sourceBatchId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class CreateStockDocumentDto {
  @IsEnum(StockDocumentType)
  type!: StockDocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  number?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  toWarehouseId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateStockDocumentItemDto)
  items!: CreateStockDocumentItemDto[];
}
