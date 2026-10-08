import { IsBoolean, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class ClinicChatSlotsDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,100}$/) clientKey!: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsString() @MaxLength(256) serviceQuery?: string;
  @IsOptional() @IsString() @MaxLength(256) preferredTimeText?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) draftRevision?: number;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) days?: number;
  @IsOptional() @IsBoolean() recentVisitAnswer?: boolean;
}
export class ClinicChatConfirmDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,100}$/) clientKey!: string;
  @IsUUID() optionsId!: string;
  @IsUUID() animalId!: string;
  @IsString() @MaxLength(4096) offerToken!: string;
  @IsBoolean() contactConsent!: boolean;
  @IsBoolean() appointmentConsent!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
export class ClinicChatBookingResultDto {
  @IsIn(['DONE', 'FAILED']) status!: 'DONE' | 'FAILED';
  @IsOptional() @IsObject() result?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(300) error?: string;
}
