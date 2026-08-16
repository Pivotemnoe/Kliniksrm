import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const hospitalRecordCancelScopes = ['ONE', 'THIS_AND_FUTURE'] as const;

export class CancelHospitalRecordsDto {
  @ApiPropertyOptional({ enum: hospitalRecordCancelScopes, default: 'ONE' })
  @IsOptional()
  @IsIn(hospitalRecordCancelScopes)
  scope?: (typeof hospitalRecordCancelScopes)[number];
}
