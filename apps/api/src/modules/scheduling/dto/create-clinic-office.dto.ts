import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClinicOfficeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  workingHours?: Record<string, unknown>;
}
