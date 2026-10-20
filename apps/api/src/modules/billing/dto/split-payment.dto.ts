import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class SplitPaymentPartDto {
  @IsUUID()
  paymentMethodId!: string;

  @IsUUID()
  cashboxId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999999)
  amount!: number;
}

export class SplitPaymentDto {
  @IsUUID('4')
  operationId!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => SplitPaymentPartDto)
  parts!: SplitPaymentPartDto[];

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
