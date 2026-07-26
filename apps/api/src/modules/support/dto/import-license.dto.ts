import { IsString, MaxLength, MinLength } from 'class-validator';

export class ImportLicenseDto {
  @IsString()
  @MinLength(20)
  @MaxLength(65536)
  document!: string;

  @IsString()
  @MaxLength(120)
  confirmation!: string;
}
