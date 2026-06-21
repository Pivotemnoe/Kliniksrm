import { ApiPropertyOptional } from '@nestjs/swagger';
import { NewsPriority } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListNewsQueryDto {
  @ApiPropertyOptional({ enum: NewsPriority })
  @IsOptional()
  @IsEnum(NewsPriority)
  priority?: NewsPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  unreadOnly?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  includeArchived?: string;

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
