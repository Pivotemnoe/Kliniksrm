import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateSupplierPaymentDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsUUID()
  supplyInvoiceId?: string;

  @IsOptional()
  @IsUUID()
  cashboxId?: string;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
