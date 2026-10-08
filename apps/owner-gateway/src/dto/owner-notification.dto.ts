import { IsBoolean, IsIn, IsInt, IsISO8601, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
export const notificationKinds = ['APPOINTMENT_CHANGE', 'APPOINTMENT_REMINDER', 'REVISIT', 'VACCINATION'] as const;
export type OwnerNotificationKind = typeof notificationKinds[number];
export class OwnerNotificationPreferenceDto {
  @IsBoolean() enabled!: boolean;
  @IsBoolean() appointmentChanges!: boolean;
  @IsBoolean() appointmentReminders!: boolean;
  @IsBoolean() revisitReminders!: boolean;
  @IsBoolean() vaccinationReminders!: boolean;
  @IsIn(['MAX']) channel!: 'MAX';
  @IsString() @MaxLength(80) timezone!: string;
  @IsInt() @Min(0) @Max(1439) quietStartMinute!: number;
  @IsInt() @Min(0) @Max(1439) quietEndMinute!: number;
}
export class DeliverOwnerNotificationDto {
  @IsUUID() ownerId!: string;
  @IsIn(notificationKinds) kind!: OwnerNotificationKind;
  @IsString() @MaxLength(800) text!: string;
  @IsISO8601() expiresAt!: string;
}
