import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export enum LaboratoryResultsImportMode {
  PREVIEW = 'PREVIEW',
  APPLY = 'APPLY',
}

export class LaboratoryResultImportRowDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  rowNumber!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string;

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

export class ImportLaboratoryResultsDto {
  @ApiProperty({ enum: LaboratoryResultsImportMode })
  @IsEnum(LaboratoryResultsImportMode)
  mode!: LaboratoryResultsImportMode;

  @ApiProperty({ type: [LaboratoryResultImportRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LaboratoryResultImportRowDto)
  rows!: LaboratoryResultImportRowDto[];
}
