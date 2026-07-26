import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportAcceptanceReportDto {
  @IsObject()
  report!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
