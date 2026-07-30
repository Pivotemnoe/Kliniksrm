import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePortalBookingRequestDto {
  @IsString()
  @MinLength(16)
  @MaxLength(80)
  clientRequestId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  animalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  animalNickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  animalSpecies?: string;

  @IsOptional()
  @IsDateString()
  preferredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsBoolean()
  contactConsent!: boolean;
}
