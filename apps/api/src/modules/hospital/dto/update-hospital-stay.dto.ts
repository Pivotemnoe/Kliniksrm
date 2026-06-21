import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateHospitalStayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalBoxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
