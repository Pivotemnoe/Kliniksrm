import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength } from 'class-validator';

export class CreateOwnerBalanceOperationDto {
  @ApiProperty({ enum: PaymentType })
  @IsEnum(PaymentType)
  type!: PaymentType;

  @ApiProperty()
  @IsNumber()
  @Max(999999999)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
