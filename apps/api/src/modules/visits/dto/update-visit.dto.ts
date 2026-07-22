import { ApiPropertyOptional } from '@nestjs/swagger';
import { VisitStatus, VisitType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class UpdateVisitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalBoxId?: string;

  @ApiPropertyOptional({ enum: VisitStatus })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiPropertyOptional({ enum: VisitType })
  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;
}
