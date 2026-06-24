import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmployeeShiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
