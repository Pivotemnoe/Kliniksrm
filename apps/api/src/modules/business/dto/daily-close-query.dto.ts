import { IsDateString, IsUUID } from 'class-validator';

export class DailyCloseQueryDto {
  @IsUUID()
  officeId!: string;

  @IsDateString()
  businessDate!: string;
}
