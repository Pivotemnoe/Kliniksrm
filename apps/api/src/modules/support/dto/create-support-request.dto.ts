import { SupportRequestPriority } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupportRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  message!: string;

  @IsEnum(SupportRequestPriority)
  priority!: SupportRequestPriority;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  contact?: string;

  @IsOptional()
  @IsBoolean()
  includeDiagnostics?: boolean;

  @IsOptional()
  @IsBoolean()
  diagnosticConsent?: boolean;
}
