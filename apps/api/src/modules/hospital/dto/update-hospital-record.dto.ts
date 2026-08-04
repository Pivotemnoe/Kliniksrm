import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { hospitalRecordStatuses, hospitalRecordTypes } from './create-hospital-record.dto';

export class UpdateHospitalRecordDto {
  @ApiPropertyOptional({ enum: hospitalRecordTypes })
  @IsOptional()
  @IsIn(hospitalRecordTypes)
  recordType?: (typeof hospitalRecordTypes)[number];

  @ApiPropertyOptional({ enum: [...hospitalRecordStatuses, 'SKIPPED'] })
  @IsOptional()
  @IsIn([...hospitalRecordStatuses, 'SKIPPED'])
  recordStatus?: (typeof hospitalRecordStatuses)[number] | 'SKIPPED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(30)
  @Max(45)
  temperatureC?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Catalog product selected while completing an unlinked planned action.' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Catalog service selected while completing an unlinked planned action.' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Quantity charged to the client for the linked catalog item.' })
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
