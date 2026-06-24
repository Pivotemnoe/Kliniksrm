import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateActivityLogDto {
  @ApiProperty({ enum: ['page_view', 'heartbeat', 'frontend_error'] })
  @IsIn(['page_view', 'heartbeat', 'frontend_error'])
  type!: 'page_view' | 'heartbeat' | 'frontend_error';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
