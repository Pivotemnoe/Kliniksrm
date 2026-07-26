import { SupportRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSupportRequestDto {
  @IsEnum(SupportRequestStatus)
  status!: SupportRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  response?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;
}
