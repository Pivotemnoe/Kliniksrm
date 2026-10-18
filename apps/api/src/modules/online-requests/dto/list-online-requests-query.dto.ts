import { ApiPropertyOptional } from '@nestjs/swagger';
import { OnlineRequestStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListOnlineRequestsQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Show recoverable deleted requests instead of active requests.' })
  @IsOptional()
  @IsIn(['true', 'false'])
  deleted?: 'true' | 'false';
  @ApiPropertyOptional({ enum: OnlineRequestStatus })
  @IsOptional()
  @IsEnum(OnlineRequestStatus)
  status?: OnlineRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offset?: string;
}
