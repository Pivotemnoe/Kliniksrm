import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class BulkBillIdsDto {
  @ApiProperty({ type: [String], description: 'Счета, выбранные для одного массового действия.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  billIds!: string[];
}

export class BulkPayBillsDto extends BulkBillIdsDto {
  @ApiProperty({ enum: PaymentType })
  @IsEnum(PaymentType)
  type!: PaymentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cashboxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
