import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AuditVisitControlQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
