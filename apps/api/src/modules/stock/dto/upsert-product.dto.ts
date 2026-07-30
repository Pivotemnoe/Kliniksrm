import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class UpsertProductDto {
  @ApiProperty()
  @IsString()
  @MaxLength(240)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  categoryTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  gtin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string;

  @ApiPropertyOptional({ type: [String], description: 'All package, supplier and internal barcodes for this product.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^\d{4,32}$/, { each: true, message: 'Каждый штрих-код должен содержать только цифры' })
  barcodes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  stockUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  writeOffUnit?: string;

  @ApiPropertyOptional({ description: 'Unit charged to the client, for example injection or ml.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  billingUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  packageQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  shelfLifeDays?: number;

  @ApiPropertyOptional({ description: 'Suggested exact expiry date for the next received batch.' })
  @IsOptional()
  @IsDateString()
  defaultExpiresAt?: string | null;

  @ApiPropertyOptional({ description: 'Generate an internal EAN-13 barcode when barcode is empty.' })
  @IsOptional()
  @IsBoolean()
  generateBarcode?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
