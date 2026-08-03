import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { VISIT_DIAGNOSIS_STATUSES, VISIT_DIAGNOSIS_TYPES } from '../visit-diagnosis-rules';

export class CreateVisitDiagnosisDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title!: string;

  @ApiProperty({ enum: VISIT_DIAGNOSIS_TYPES })
  @IsIn(VISIT_DIAGNOSIS_TYPES)
  @IsString()
  @MaxLength(120)
  diagnosisType!: string;

  @ApiPropertyOptional({ enum: VISIT_DIAGNOSIS_STATUSES })
  @IsOptional()
  @IsIn(VISIT_DIAGNOSIS_STATUSES)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  status?: string;
}
