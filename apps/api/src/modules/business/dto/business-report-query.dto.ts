import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class BusinessReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;
}
