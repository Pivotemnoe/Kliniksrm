import { IsNotEmpty, IsNumber, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePayrollAdjustmentDto {
  @IsUUID()
  employeeId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
