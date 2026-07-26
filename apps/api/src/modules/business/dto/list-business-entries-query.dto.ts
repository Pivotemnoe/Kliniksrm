import { BusinessCategoryType, BusinessEntryStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BusinessReportQueryDto } from './business-report-query.dto';

export class ListBusinessEntriesQueryDto extends BusinessReportQueryDto {
  @IsOptional()
  @IsEnum(BusinessCategoryType)
  type?: BusinessCategoryType;

  @IsOptional()
  @IsEnum(BusinessEntryStatus)
  status?: BusinessEntryStatus;

  @IsOptional()
  @IsUUID()
  dailyCloseId?: string;
}
