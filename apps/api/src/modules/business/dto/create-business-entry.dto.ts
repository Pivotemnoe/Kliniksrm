import { BusinessCategoryType, BusinessEntrySource } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateBusinessEntryDto {
  @IsEnum(BusinessCategoryType)
  type!: BusinessCategoryType;

  @IsUUID()
  categoryId!: string;

  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  amount!: number;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsEnum(BusinessEntrySource)
  source?: BusinessEntrySource;

  @IsOptional()
  @IsUUID()
  officeId?: string;

  @IsOptional()
  @IsUUID()
  cashboxId?: string;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsUUID()
  payrollPeriodId?: string;

  @IsOptional()
  @IsUUID()
  dailyCloseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  counterparty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsBoolean()
  requiresResolution?: boolean;
}
