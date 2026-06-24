import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AuditExportQueryDto {
  @ApiPropertyOptional({ description: 'ISO date/time. Defaults to 24 hours ago.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date/time. Defaults to now.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Maximum number of raw events. Defaults to 5000.' })
  @IsOptional()
  @IsString()
  limit?: string;
}
