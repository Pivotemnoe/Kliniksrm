import { ApiPropertyOptional } from '@nestjs/swagger';
import { LaboratoryOrderItemStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVisitLaboratoryItemDto {
  @ApiPropertyOptional({ enum: LaboratoryOrderItemStatus })
  @IsOptional()
  @IsEnum(LaboratoryOrderItemStatus)
  status?: LaboratoryOrderItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  resultValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resultText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referenceRange?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
