import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePayrollPeriodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}
