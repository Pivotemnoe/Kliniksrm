import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
export class CreateAvitoDraftDto {
  @IsString() @MinLength(16) @MaxLength(100) clientKey: string;
  @IsIn(['CLINIC', 'GROOMING', 'HOTEL']) direction: string;
  @IsOptional() @IsString() @MaxLength(20) sourceListingId?: string;
}
export class SaveAvitoDraftDto {
  @IsInt() @Min(1) version: number;
  @IsObject() content: Record<string, unknown>;
}
export class AvitoDraftVersionDto { @Type(() => Number) @IsInt() @Min(1) version: number; }
export class GenerateAvitoDraftDto extends AvitoDraftVersionDto {
  @IsIn(['TEMPLATE', 'AI']) mode: 'TEMPLATE' | 'AI';
  @IsString() @MinLength(16) @MaxLength(100) clientKey: string;
}
export class RestoreAvitoDraftDto extends AvitoDraftVersionDto { @IsInt() @Min(1) revision: number; }
