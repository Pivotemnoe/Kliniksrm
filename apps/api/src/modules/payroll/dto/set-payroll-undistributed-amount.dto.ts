import { IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

export class SetPayrollUndistributedAmountDto {
  @IsNumber()
  @Min(0)
  @Max(999999999)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
