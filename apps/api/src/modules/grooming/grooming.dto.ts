import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { bookingAttribution, BookingAttribution } from '../../common/booking-attribution';

export class GroomingSpecialistDto {
  @IsOptional() @IsString() @MinLength(1) employeeId?: string;
  @IsString() @MinLength(2) @MaxLength(120) displayName!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @IsIn(['DOG', 'CAT'], { each: true }) species!: string[];
  @IsOptional() @IsString() @Matches(/^\d{1,24}$|^$/) maxUserId?: string;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class CreateGroomerDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @IsIn(['DOG', 'CAT'], { each: true }) species!: string[];
  @IsOptional() @IsString() @Matches(/^\d{1,24}$|^$/) maxUserId?: string;
}
export class GroomingRuleDto {
  @IsString() specialistId!: string;
  @IsString() serviceId!: string;
  @IsString() locationId!: string;
  @IsString() workplaceId!: string;
  @IsIn(['DOG', 'CAT']) species!: string;
  @IsIn(['ANY', 'SMALL', 'MEDIUM', 'LARGE']) size!: string;
  @IsIn(['ANY', 'SHORT', 'LONG', 'CURLY', 'DOUBLE']) coat!: string;
  @IsInt() @Min(5) @Max(480) durationMinutes!: number;
  @IsInt() @Min(0) @Max(120) bufferMinutes!: number;
  @IsInt() @Min(5) @Max(60) stepMinutes!: number;
  @IsInt() @Min(0) @Max(10080) minimumLeadMinutes!: number;
  @IsInt() @Min(1) @Max(90) maximumDaysAhead!: number;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class GroomingSettingsDto {
  @IsOptional() @IsString() @Matches(/^\d{1,24}$|^$/) testClientMaxId?: string;
  @IsBoolean() selfBookingEnabled!: boolean;
  @IsInt() @Min(0) @Max(10080) minimumCancelMinutes!: number;
  @IsArray() @ArrayMaxSize(2) @IsIn([2, 24], { each: true }) reminderHours!: number[];
  @IsArray() @ArrayMaxSize(10) @Matches(/^\d{1,24}$/, { each: true }) administratorMaxIds!: string[];
  @IsInt() @Min(1) version!: number;
}
export class GroomingServiceDto {
  @IsString() @MinLength(2) @MaxLength(180) title!: string;
  @IsNumber() @Min(0) @Max(1000000) price!: number;
  @IsOptional() @IsIn(['FIXED', 'RANGE', 'UP_TO', 'QUOTE', 'PERCENT']) priceType?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1000000) maximumPrice?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class GroomingPriceImportDto {
  @IsString() @MinLength(16) @MaxLength(120) clientKey!: string;
}
export class GroomingRulesBatchDto extends GroomingPriceImportDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(250) @ValidateNested({ each: true }) @Type(() => GroomingRuleDto) rules!: GroomingRuleDto[];
}
export class GroomingScheduleBatchDto extends GroomingPriceImportDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true }) employeeIds!: string[];
  @IsString() locationId!: string;
  @IsOptional() @IsString() workplaceId?: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsIn([0, 1, 2, 3, 4, 5, 6], { each: true }) weekdays!: number[];
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) startsTime!: string;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) endsTime!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(62) @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true }) excludedDates?: string[];
  @IsString() @MaxLength(500) comment!: string;
}
export class GroomingLocationDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MaxLength(300) address!: string;
  @IsString() @MaxLength(80) timezone!: string;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class GroomingWorkplaceDto {
  @IsString() locationId!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class GroomingWorkPeriodDto {
  @IsString() employeeId!: string;
  @IsString() locationId!: string;
  @IsOptional() @IsString() workplaceId?: string;
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
  @IsIn(['WORK', 'BLOCK']) kind!: string;
  @IsString() @MaxLength(500) comment!: string;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class GroomingOptionsDto {
  @IsString() @MinLength(1) animalId!: string;
  @IsString() @MinLength(1) serviceId!: string;
  @IsOptional() @IsString() specialistId?: string;
  @IsIn(['DOG', 'CAT']) species!: string;
  @IsIn(['ANY', 'SMALL', 'MEDIUM', 'LARGE']) size!: string;
  @IsIn(['ANY', 'SHORT', 'LONG', 'CURLY', 'DOUBLE']) coat!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional() @IsString() reservationId?: string;
}
export class GroomingBookDto {
  @IsOptional() @Transform(({ value }) => bookingAttribution(value)) attribution?: BookingAttribution;
  @IsString() @MinLength(16) @MaxLength(120) clientKey!: string;
  @IsString() @MinLength(20) @MaxLength(4096) offerToken!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(180, { each: true }) looks?: string[];
  @IsBoolean() contactConsent!: boolean;
  @IsBoolean() bookingConsent!: boolean;
}
export class GroomingChangeDto extends GroomingBookDto {
  @IsInt() @Min(1) version!: number;
}
export class GroomingCancelDto {
  @IsString() @MinLength(16) @MaxLength(120) clientKey!: string;
  @IsInt() @Min(1) version!: number;
}
export class GroomingStatusDto extends GroomingCancelDto {
  @IsIn(['ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) status!: string;
}
export class GroomingPetDto {
  @IsString() @MinLength(16) @MaxLength(120) clientKey!: string;
  @IsString() @MinLength(1) @MaxLength(80) nickname!: string;
  @IsIn(['DOG', 'CAT']) species!: string;
  @IsOptional() @IsString() @MaxLength(120) breed?: string;
}
