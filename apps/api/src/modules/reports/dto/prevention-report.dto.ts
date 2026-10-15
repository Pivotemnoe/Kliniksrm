import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { preventionDiseases, PreventionDisease } from '../prevention-types';
export class PreventionProfileDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(200, { each: true }) aliases!: string[];
  @IsArray() @ArrayMaxSize(7) @IsIn(preventionDiseases, { each: true }) diseases!: PreventionDisease[];
  @IsOptional() @IsString() @MaxLength(250) manufacturer?: string;
  @IsOptional() @IsString() @MaxLength(500) source?: string;
  @IsOptional() @IsBoolean() reviewVariant?: boolean;
}
export class PreventionSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) time!: string;
  @IsString() @MaxLength(80) timezone!: string;
  @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(200, { each: true }) signatories!: string[];
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PreventionProfileDto) profiles!: PreventionProfileDto[];
}
export class GeneratePreventionReportDto {
  @IsString() @Matches(/^20\d{2}-(?:0[1-9]|1[0-2])$/) month!: string;
  @IsOptional() @IsBoolean() regenerate?: boolean;
}
