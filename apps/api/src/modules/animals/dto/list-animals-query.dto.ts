import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListAnimalsQueryDto {
  @IsOptional() @IsString() @MaxLength(120) species?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE', 'UNKNOWN']) sex?: 'MALE' | 'FEMALE' | 'UNKNOWN';
  @IsOptional() @IsString() @MaxLength(120) status?: string;
  @IsOptional() @IsBooleanString() isFavorite?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Include archived patients.', enum: ['true', 'false'] })
  @IsOptional()
  @IsBooleanString()
  includeArchived?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offset?: string;
}
