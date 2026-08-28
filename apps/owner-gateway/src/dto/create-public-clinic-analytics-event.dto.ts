import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const PUBLIC_CLINIC_ANALYTICS_EVENTS = [
  'page_view',
  'section_view',
  'navigation_click',
  'booking_open',
  'phone_click',
  'chat_open',
  'chat_topic',
  'chat_handoff_open',
  'chat_handoff_sent',
  'route_click',
  'offer_open',
  'offer_click',
] as const;

export class CreatePublicClinicAnalyticsEventDto {
  @IsString()
  @MinLength(16)
  @MaxLength(80)
  eventId!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(80)
  sessionId!: string;

  @IsString()
  @IsIn(PUBLIC_CLINIC_ANALYTICS_EVENTS)
  eventName!: (typeof PUBLIC_CLINIC_ANALYTICS_EVENTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  section?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  target?: string | null;

  @IsString()
  @MaxLength(200)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  referrerHost?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmSource?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmMedium?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmCampaign?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  utmContent?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['mobile', 'tablet', 'desktop'])
  deviceType?: string | null;

  @IsOptional()
  @IsInt()
  @Min(240)
  @Max(7680)
  viewportWidth?: number | null;
}
