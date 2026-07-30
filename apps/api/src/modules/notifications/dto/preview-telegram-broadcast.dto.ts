import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PreviewTelegramBroadcastDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
}
