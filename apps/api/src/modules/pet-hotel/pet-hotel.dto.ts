import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { bookingAttribution, BookingAttribution } from '../../common/booking-attribution';

export class PetHotelBookingDto {
  @IsOptional() @Transform(({ value }) => bookingAttribution(value)) attribution?: BookingAttribution;
  @IsString() @MinLength(8) @MaxLength(100) clientKey!: string;
  @IsString() @MaxLength(100) ownerId!: string;
  @IsString() @MaxLength(100) animalId!: string;
  @IsString() @MaxLength(100) roomId!: string;
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999) weightKg?: number;
  @IsInt() @Min(0) @Max(1000) walkCount!: number;
  @IsString() @MaxLength(4000) notes!: string;
}
export class PetHotelChangeDto extends PetHotelBookingDto {
  @IsInt() @Min(1) version!: number;
}
export class PetHotelStatusDto {
  @IsString() @MinLength(8) @MaxLength(100) clientKey!: string;
  @IsInt() @Min(1) version!: number;
  @IsIn(['IN_HOUSE', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW']) status!: string;
}
export class PetHotelRoomDto {
  @IsString() @MinLength(1) @MaxLength(30) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsIn(['CAT', 'DOG']) species!: string;
  @IsInt() @Min(0) @Max(10000) sortOrder!: number;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000000) dailyRate?: number | null;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class PetHotelSetupDto {
  @IsString() @MinLength(8) @MaxLength(100) clientKey!: string;
}
export class PetHotelSettingsDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000000) dailyRate!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000000) walkRate!: number;
  @IsInt() @Min(1) @Max(365) minimumDays!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999) maximumDogWeightKg!: number;
  @IsString() @MaxLength(5) checkInFrom!: string;
  @IsString() @MaxLength(5) checkInTo!: string;
  @IsString() @MaxLength(500) siteUrl!: string;
  @IsOptional() @IsBoolean() selfBookingEnabled?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @Matches(/^\d{1,24}$/, { each: true }) administratorMaxIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) @Max(168, { each: true }) reminderHours?: number[];
  @IsInt() @Min(1) version!: number;
}
