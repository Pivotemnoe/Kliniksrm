import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LaboratoryOrderItemStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class UpdateLaboratoryOrderResultRowDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ enum: LaboratoryOrderItemStatus })
  @IsOptional()
  @IsEnum(LaboratoryOrderItemStatus)
  status?: LaboratoryOrderItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  resultValue?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resultText?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  unit?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referenceRange?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}

export class UpdateLaboratoryOrderResultsDto {
  @ApiProperty({ type: [UpdateLaboratoryOrderResultRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdateLaboratoryOrderResultRowDto)
  items!: UpdateLaboratoryOrderResultRowDto[];
}
