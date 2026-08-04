import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { hospitalRecordTypes } from './create-hospital-record.dto';

export class CreateHospitalTreatmentPlanItemDto {
  @ApiProperty({ enum: hospitalRecordTypes })
  @IsIn(hospitalRecordTypes)
  recordType!: (typeof hospitalRecordTypes)[number];

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional({ description: 'Dose, route, volume or other reusable instruction.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: [String], description: 'Exact planned date-times for this treatment item.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsDateString({}, { each: true })
  scheduledAt!: string[];
}

export class CreateHospitalTreatmentPlanDto {
  @ApiPropertyOptional({ description: 'Optional clinical label for this treatment plan.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ type: [CreateHospitalTreatmentPlanItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateHospitalTreatmentPlanItemDto)
  items!: CreateHospitalTreatmentPlanItemDto[];
}
