import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
}
