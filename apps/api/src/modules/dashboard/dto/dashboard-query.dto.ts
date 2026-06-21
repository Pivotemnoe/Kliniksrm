import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({ description: 'Дата сводки в формате YYYY-MM-DD или ISO.' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
