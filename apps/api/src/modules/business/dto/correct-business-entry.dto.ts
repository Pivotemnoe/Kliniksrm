import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CorrectBusinessEntryDto {
  @IsUUID()
  categoryId!: string;

  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  amount!: number;

  @IsOptional()
  @IsUUID()
  cashboxId?: string;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

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

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
