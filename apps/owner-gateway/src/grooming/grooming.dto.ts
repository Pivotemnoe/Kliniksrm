import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
export class GroomingBookingDto {
 @IsUUID('4') clientRequestId!: string;
 @IsString() @MinLength(2) @MaxLength(100) contactName!: string;
 @IsString() @MaxLength(32) phone!: string;
 @IsString() @MinLength(1) @MaxLength(80) petName!: string;
 @IsString() @MaxLength(40) breedId!: string;
 @IsString() @MaxLength(30) serviceId!: string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) preferredDate?: string;
 @IsIn(['ANY','MORNING','AFTERNOON','EVENING']) timeWindow!: string;
 @IsString() @MaxLength(1500) notes!: string;
 @IsArray() @ArrayMaxSize(3) @ArrayUnique() @IsString({each:true}) lookIds!: string[];
 @IsBoolean() contactConsent!: boolean;
 @IsOptional() @IsString() @MaxLength(200) website?: string;
}
