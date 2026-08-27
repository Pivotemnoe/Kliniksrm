import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateVaccinationDto {
  @ApiPropertyOptional({ description: 'Visit that receives the vaccination and its bill positions.' })
  @IsOptional()
  @IsUUID()
  visitId?: string;

  @ApiPropertyOptional({ description: 'Vaccine product selected from the clinic catalog.' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1000000)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1000000)
  stockQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000000)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000000)
  discount?: number;

  @ApiPropertyOptional({ description: 'Optional vaccination service added to the same visit bill.' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000000)
  serviceUnitPrice?: number;

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

  @ApiPropertyOptional({ description: 'Schedule owner reminders 7 days and 1 day before revaccination.' })
  @IsOptional()
  @IsBoolean()
  ownerReminderEnabled?: boolean;

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
