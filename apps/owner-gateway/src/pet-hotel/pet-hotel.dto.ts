import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class HotelOperationDto {
  @IsString() @MinLength(16) @MaxLength(120) clientKey!: string;
  @IsIn(['STATE', 'OPTIONS', 'BOOK', 'RESCHEDULE', 'CANCEL', 'PET_CREATE']) kind!: string;
  @IsObject() input!: Record<string, unknown>;
}
export class HotelResultDto {
  @IsIn(['DONE', 'FAILED']) status!: string;
  @IsOptional() @IsObject() result?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(300) error?: string;
}
export class HotelTokenDto { @IsString() @MinLength(32) @MaxLength(100) token!: string; }
export class HotelDraftDto { @IsString() @MinLength(32) @MaxLength(100) offerToken!: string; }
export class HotelSnapshotDto { @IsObject() payload!: Record<string, unknown>; }
export class HotelRegistrationDetailsDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @IsString() @MinLength(10) @MaxLength(32) phone!: string;
  @IsBoolean() contactConsent!: boolean;
}
export class HotelRegistrationResultDto {
  @IsOptional() @IsObject() result?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(300) error?: string;
}
export class HotelDeliveryDto {
  @IsIn(['OWNER', 'STAFF']) recipientKind!: 'OWNER' | 'STAFF';
  @IsString() @MinLength(1) @MaxLength(100) recipientId!: string;
  @IsIn(['PET_HOTEL_CHANGE', 'PET_HOTEL_REMINDER']) kind!: 'PET_HOTEL_CHANGE' | 'PET_HOTEL_REMINDER';
  @IsString() @MinLength(1) @MaxLength(800) text!: string;
  @IsString() @MaxLength(40) expiresAt!: string;
}
