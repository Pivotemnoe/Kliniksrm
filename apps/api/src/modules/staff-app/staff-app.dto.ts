import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { GroomingOptionsDto, GroomingBookDto } from '../grooming/grooming.dto';
import { CreateAppointmentDto } from '../appointments/dto/create-appointment.dto';
export class StaffClinicBookDto extends CreateAppointmentDto { @IsUUID() clientKey!: string; }
export class StaffAppSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsBoolean() clinicBooking!: boolean;
  @IsBoolean() groomingBooking!: boolean;
  @IsBoolean() notifications!: boolean;
  @IsDateString() updatedAt!: string;
}
export class StaffGroomingOptionsDto extends GroomingOptionsDto { @IsUUID() ownerId!: string; }
export class StaffGroomingBookDto extends GroomingBookDto { @IsUUID() ownerId!: string; }
export class StaffClientLookupDto { @IsString() @MinLength(10) @MaxLength(32) phone!: string; }
export class StaffClientCreateDto extends StaffClientLookupDto { @IsString() @MinLength(2) @MaxLength(200) fullName!: string; }
export class StaffPetCreateDto {
  @IsString() @MinLength(1) @MaxLength(120) nickname!: string;
  @IsString() @MinLength(1) @MaxLength(80) species!: string;
  @IsString() @MinLength(1) @MaxLength(120) breed!: string;
  @IsOptional() @IsString() @MaxLength(2048) clientAccessToken?: string;
}
export class StaffPushEndpointDto { @IsString() @MinLength(10) @MaxLength(2048) endpoint!: string; }
export class StaffPushSubscriptionDto extends StaffPushEndpointDto {
  @IsString() @MaxLength(100) p256dh!: string;
  @IsString() @MaxLength(30) auth!: string;
}
