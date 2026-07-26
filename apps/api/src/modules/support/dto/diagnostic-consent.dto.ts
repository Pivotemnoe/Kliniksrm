import { Equals, IsString } from 'class-validator';

export class DiagnosticConsentDto {
  @IsString()
  @Equals('EXPORT_SAFE_DIAGNOSTICS')
  confirmation!: string;
}
