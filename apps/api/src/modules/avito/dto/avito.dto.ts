import { IsBoolean, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAvitoSettingsDto {
  @IsInt() @Min(1) version: number;
  @IsObject() settings: Record<string, unknown>;
}
export class SimulateAvitoDto {
  @IsString() @MaxLength(20) listingId: string;
  @IsString() @MinLength(1) @MaxLength(4000) text: string;
  @IsOptional() @IsObject() contact?: Record<string, unknown>;
  @IsOptional() @IsISO8601() at?: string;
  @IsOptional() @IsBoolean() useAi?: boolean;
  @IsOptional() @IsString() @MinLength(16) @MaxLength(100) clientKey?: string;
}
export class AvitoReplyDto {
  @IsString() @MinLength(16) @MaxLength(100) clientKey: string;
  @IsString() @MinLength(1) @MaxLength(4000) text: string;
  @IsInt() @Min(0) version: number;
  @IsOptional() @IsString() @MaxLength(100) draftId?: string;
}
export class AvitoModeDto {
  @IsIn(['BOT', 'HUMAN', 'PAUSED']) mode: 'BOT' | 'HUMAN' | 'PAUSED';
  @IsInt() @Min(0) version: number;
}
export class AvitoCallDto {
  @IsString() @MinLength(16) @MaxLength(100) clientKey: string;
  @IsISO8601() occurredAt: string;
  @IsIn(['CLINIC', 'GROOMING', 'HOTEL']) direction: 'CLINIC' | 'GROOMING' | 'HOTEL';
  @IsBoolean() missed: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class AvitoListDto {
  @IsOptional() @IsIn(['CLINIC', 'GROOMING', 'HOTEL', 'UNASSIGNED']) direction?: string;
  @IsOptional() @IsIn(['true', 'false']) attention?: string;
  @IsOptional() @IsString() @MaxLength(100) cursor?: string;
}
export class AvitoSyncDto { @IsOptional() @IsInt() @Min(0) @Max(10000) offset?: number; }
export class AvitoListingsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) offset?: number;
  @IsOptional() @IsIn(['all', 'active', 'old', 'removed', 'blocked', 'rejected']) status?: string;
}
