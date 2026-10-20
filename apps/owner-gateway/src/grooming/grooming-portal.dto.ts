import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, IsISO8601, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
export class GroomingOperationDto {
  @IsString() @MinLength(16) @MaxLength(120) clientKey!: string;
  @IsIn(['STATE', 'OPTIONS', 'BOOK', 'RESCHEDULE', 'CANCEL', 'PET_CREATE']) kind!: string;
  @IsObject() input!: Record<string, unknown>;
}
export class GroomingOperationResultDto {
  @IsIn(['DONE', 'FAILED']) status!: string;
  @IsOptional() @IsObject() result?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(300) error?: string;
}
export class GroomingRegistrationDetailsDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @IsString() @MinLength(10) @MaxLength(32) phone!: string;
  @IsBoolean() contactConsent!: boolean;
}
export class GroomingRegistrationResultDto {
  @IsOptional() @IsObject() result?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(300) error?: string;
}
export class GroomingDeliveryDto {
  @IsIn(['OWNER', 'STAFF']) recipientKind!: string;
  @IsString() @MaxLength(100) recipientId!: string;
  @IsIn(['GROOMING_CHANGE', 'GROOMING_REMINDER']) kind!: 'GROOMING_CHANGE' | 'GROOMING_REMINDER';
  @IsString() @MinLength(1) @MaxLength(800) text!: string;
  @IsString() @MaxLength(40) expiresAt!: string;
}
export class GroomingSiteSelectionDto {
  @IsString() @MaxLength(100) serviceId!: string;
  @IsString() @MaxLength(100) specialistId!: string;
  @IsISO8601() startsAt!: string;
  @IsIn(['DOG', 'CAT']) species!: string;
  @IsIn(['ANY', 'SMALL', 'MEDIUM', 'LARGE']) size!: string;
  @IsIn(['ANY', 'SHORT', 'LONG', 'CURLY', 'DOUBLE']) coat!: string;
}
export class GroomingDraftDto {
  @IsString() @MaxLength(100) breedId!: string;
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(180, { each: true }) looks!: string[];
  @IsString() @MaxLength(2000) notes!: string;
  @IsOptional() @ValidateNested() @Type(() => GroomingSiteSelectionDto) selection?: GroomingSiteSelectionDto;
}
export class GroomingDraftConsumeDto { @IsString() @MinLength(32) @MaxLength(100) token!: string; }
