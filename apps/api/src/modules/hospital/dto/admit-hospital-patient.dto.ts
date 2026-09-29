import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsNumber, Min, Max,  IsString, IsUUID, MaxLength } from 'class-validator';

export class AdmitHospitalPatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dailyServiceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  dailyServicePrice?: number;

  @ApiProperty()
  @IsUUID()
  ownerId!: string;

  @ApiProperty()
  @IsUUID()
  animalId!: string;

  @ApiProperty()
  @IsUUID()
  hospitalBoxId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  admittedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  purpose?: string;
}
