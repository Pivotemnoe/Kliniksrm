import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const hospitalRecordTypes = [
  'TEMPERATURE',
  'MEDICATION',
  'PROCEDURE',
  'OBSERVATION',
  'FEEDING',
  'CARE',
  'OTHER',
] as const;

export class CreateHospitalRecordDto {
  @ApiProperty({ enum: hospitalRecordTypes })
  @IsIn(hospitalRecordTypes)
  recordType!: (typeof hospitalRecordTypes)[number];

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(30)
  @Max(45)
  temperatureC?: number;

  @ApiPropertyOptional({ description: 'Dose, volume, measured value or other short result.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Catalog service charged to the hospital bill.' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Catalog product charged and deducted from stock.' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Quantity charged to the client.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(999999)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Quantity deducted from stock in the product write-off unit.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(999999)
  stockQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999999)
  unitPrice?: number;
}
