import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListEmployeeShiftsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'ISO date/time. Defaults to start of today.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date/time. Defaults to 14 days after from.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
