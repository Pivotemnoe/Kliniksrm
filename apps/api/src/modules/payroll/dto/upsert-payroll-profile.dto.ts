import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

class PayrollServiceRuleDto {
  @IsUUID()
  serviceId!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;
}

class PayrollProductRuleDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;
}

export class UpsertPayrollProfileDto {
  @IsNumber()
  @Min(0)
  fixedAmount!: number;

  @IsNumber()
  @Min(0)
  shiftRate!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  servicePercent!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  productPercent!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollServiceRuleDto)
  serviceRules?: PayrollServiceRuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollProductRuleDto)
  productRules?: PayrollProductRuleDto[];
}
