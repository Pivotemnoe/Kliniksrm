import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVaccinationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  vaccinatedAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vaccineBatch?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vaccineSeries?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  vaccineExpiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  smsReminder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Create or update a revaccination task when revaccination date is set.' })
  @IsOptional()
  @IsBoolean()
  createRevaccinationTask?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  revaccinationAssigneeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  revaccinationAssigneeRoleCode?: string | null;
}
