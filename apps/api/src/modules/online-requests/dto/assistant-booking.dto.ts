import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class AssistantBookingRuleDto {
  @IsUUID() officeId!: string;
  @IsUUID() serviceId!: string;
  @IsUUID() employeeId!: string;
  @IsUUID() roomId!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsInt() @Min(5) @Max(240) durationMinutes!: number;
  @IsInt() @Min(5) @Max(60) stepMinutes!: number;
  @IsInt() @Min(0) @Max(10080) minimumLeadMinutes!: number;
  @IsInt() @Min(1) @Max(60) maximumDaysAhead!: number;
}

// Identity is supplied by our authenticated owner gateway, never by an LLM or a public form.
export class AssistantBookingOptionsDto {
  @IsUUID() ownerId!: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsString() @MaxLength(256) serviceQuery?: string;
  @IsOptional() @IsString() @MaxLength(256) preferredTimeText?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) days?: number;
  @IsOptional() @IsBoolean() recentVisitAnswer?: boolean;
}

export class AssistantBookDto {
  @IsUUID() ownerId!: string;
  @IsUUID() animalId!: string;
  @IsUUID() conversationId!: string;
  @IsInt() @Min(1) @Max(2147483647) bookingSequence!: number;
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,100}$/) clientKey!: string;
  @IsString() @MaxLength(4096) offerToken!: string;
  @IsBoolean() contactConsent!: boolean;
  @IsBoolean() appointmentConsent!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @IsOptional() @IsString() @MaxLength(32) contactPhone?: string;
}
