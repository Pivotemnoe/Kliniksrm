import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { bookingAttribution, BookingAttribution } from '../../common/booking-attribution';
export class HotelOwnerOptionsDto {
  @IsString() @MinLength(1) @MaxLength(100) animalId!: string;
  @IsIn(['CAT', 'DOG']) species!: string;
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) startsAt!: string;
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) endsAt!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999) weightKg?: number;
  @IsInt() @Min(0) @Max(1000) walkCount!: number;
  @IsOptional() @IsString() @MaxLength(100) reservationId?: string;
}
export class HotelOwnerBookDto {
  @IsOptional() @Transform(({ value }) => bookingAttribution(value)) attribution?: BookingAttribution;
  @IsString() @MinLength(1) @MaxLength(100) animalId!: string;
  @IsString() @MaxLength(6000) @MinLength(32) offerToken!: string;
  @IsString() @MaxLength(4000) notes!: string;
  @IsBoolean() contactConsent!: boolean;
  @IsBoolean() bookingConsent!: boolean;
}
export class HotelOwnerMoveDto extends HotelOwnerBookDto {
  @IsString() @MinLength(1) @MaxLength(100) reservationId!: string;
  @IsInt() @Min(1) version!: number;
}
export class HotelOwnerCancelDto {
  @IsString() @MinLength(1) @MaxLength(100) reservationId!: string;
  @IsInt() @Min(1) version!: number;
}
export class HotelOwnerPetDto {
  @IsString() @MinLength(1) @MaxLength(120) nickname!: string;
  @IsIn(['CAT', 'DOG']) species!: string;
  @IsOptional() @IsString() @MaxLength(120) breed?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999) weightKg?: number;
}
