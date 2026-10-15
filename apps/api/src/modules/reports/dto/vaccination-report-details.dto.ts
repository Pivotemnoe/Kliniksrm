import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ArrayMaxSize } from 'class-validator';
import { preventionDiseases, PreventionDisease } from '../prevention-types';

export class VaccinationReportDetailsDto {
  @IsOptional() @IsIn(['PRIMARY', 'REVACCINATION']) stage?: 'PRIMARY' | 'REVACCINATION';
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsIn(preventionDiseases, { each: true }) diseases?: PreventionDisease[];
  @IsOptional() @IsString() @MaxLength(120) doseText?: string;
  @IsOptional() @IsString() @MaxLength(120) administrationRoute?: string;
  @IsOptional() @IsString() @MaxLength(200) syringesAndNeedles?: string;
  @IsOptional() @IsString() @MaxLength(250) manufacturer?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(100000) usedDoses?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(100000) consumedDoses?: number;
}
