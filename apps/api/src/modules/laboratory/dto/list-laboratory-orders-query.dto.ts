import { ApiPropertyOptional } from '@nestjs/swagger';
import { LaboratoryOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination';

export class ListLaboratoryOrdersQueryDto implements PaginationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offset?: string;

  @ApiPropertyOptional({ enum: LaboratoryOrderStatus })
  @IsOptional()
  @IsEnum(LaboratoryOrderStatus)
  status?: LaboratoryOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
