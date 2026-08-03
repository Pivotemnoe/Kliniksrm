import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { hospitalRecordTypes } from './create-hospital-record.dto';

export class CreateHospitalAmendmentDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

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
}
