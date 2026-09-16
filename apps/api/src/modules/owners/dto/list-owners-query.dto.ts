import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListOwnersQueryDto {
  @IsOptional() @IsBooleanString() hasAnimals?: string;
  @IsOptional() @IsBooleanString() hasVisits?: string;
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
