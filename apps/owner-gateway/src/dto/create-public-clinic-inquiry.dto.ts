import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePublicClinicInquiryDto {
  @IsString()
  @MinLength(16)
  @MaxLength(80)
  clientRequestId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  contactName!: string;

  @IsString()
  @Matches(/^[+\d\s()\-]{10,32}$/)
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  animalNickname!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;

  @IsBoolean()
  contactConsent!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
