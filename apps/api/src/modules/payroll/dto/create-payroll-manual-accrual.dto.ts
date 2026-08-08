import { IsDateString, IsNotEmpty, IsNumber, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreatePayrollManualAccrualDto {
  @IsUUID()
  employeeId!: string;

  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  amount!: number;

  @IsDateString()
  accruedAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
