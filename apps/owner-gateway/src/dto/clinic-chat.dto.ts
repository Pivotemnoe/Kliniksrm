import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
export class ClinicChatMessageDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,100}$/) clientKey!: string;
  @IsString() @MinLength(1) @MaxLength(4000) text!: string;
}
export class ClinicChatContactDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,100}$/) clientKey!: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsBoolean() declined?: boolean;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
export class ClinicChatBookingDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,100}$/) clientKey!: string;
  @IsString() @MinLength(1) @MaxLength(120) contactName!: string;
  @IsString() @Matches(/^(?=(?:[^0-9]*[0-9]){10,15}[^0-9]*$)[+0-9 ()-]{10,32}$/) phone!: string;
  @IsString() @MinLength(1) @MaxLength(160) animalNickname!: string;
  @IsString() @MinLength(1) @MaxLength(1000) comment!: string;
  @IsOptional() @IsISO8601() preferredAt?: string;
  @IsBoolean() contactConsent!: boolean;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
export class ClinicChatCommandDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,100}$/) clientKey!: string;
  @IsIn(['REPLY', 'RESUME', 'RESOLVE', 'CONFIRM']) action!: 'REPLY' | 'RESUME' | 'RESOLVE' | 'CONFIRM';
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
  @IsOptional() @IsString() @MaxLength(100) appointmentId?: string;
  @IsOptional() @IsString() @MaxLength(100) crmRequestId?: string;
  @IsOptional() @IsBoolean() returnToAssistant?: boolean;
}
export class ClinicChatAckDto {
  @IsInt() @Min(0) @Max(2147483647) sequence!: number;
  @IsString() @MaxLength(100) crmRequestId!: string;
}
