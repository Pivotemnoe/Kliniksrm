import { ApiPropertyOptional } from '@nestjs/swagger';
import { VisitStatus, VisitType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateVisitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  animalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  queueEntryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalBoxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ enum: VisitStatus })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiPropertyOptional({ enum: VisitType })
  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;
}
