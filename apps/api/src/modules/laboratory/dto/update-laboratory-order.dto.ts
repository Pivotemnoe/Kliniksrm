import { ApiPropertyOptional } from '@nestjs/swagger';
import { LaboratoryOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLaboratoryOrderDto {
  @ApiPropertyOptional({ enum: LaboratoryOrderStatus })
  @IsOptional()
  @IsEnum(LaboratoryOrderStatus)
  status?: LaboratoryOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}
