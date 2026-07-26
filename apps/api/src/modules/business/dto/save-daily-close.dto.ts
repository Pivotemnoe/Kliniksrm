import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class DailyCloseLineDto {
  @IsString()
  @MaxLength(300)
  lineKey!: string;

  @IsNumber()
  @Min(-999999999)
  @Max(999999999)
  actualAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class SaveDailyCloseDto {
  @IsUUID()
  officeId!: string;

  @IsDateString()
  businessDate!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyCloseLineDto)
  lines?: DailyCloseLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
