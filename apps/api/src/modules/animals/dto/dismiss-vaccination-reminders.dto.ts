import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class DismissVaccinationRemindersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true })
  vaccinationIds!: string[];
  @IsString() @MinLength(2) @MaxLength(500)
  reason!: string;
}
