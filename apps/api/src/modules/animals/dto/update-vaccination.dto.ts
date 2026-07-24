import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateVaccinationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string | null;

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

  @ApiPropertyOptional({ description: 'Schedule owner reminders 7 days and 1 day before revaccination.' })
  @IsOptional()
  @IsBoolean()
  ownerReminderEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Create, update or cancel a revaccination task.' })
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
