import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, MaxLength, IsOptional, IsNumber, Min, Max, IsString, IsUUID } from 'class-validator';

export class UpdateHospitalStayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  depositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['Здоров', 'Без изменений', 'Улучшение', 'Ухудшение', 'Обследование', 'Погиб', 'Неактивен'])
  animalStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dailyServiceId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  dailyServicePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalBoxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
