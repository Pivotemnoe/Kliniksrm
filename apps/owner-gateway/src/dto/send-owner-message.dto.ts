import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendOwnerMessageDto {
  @IsIn(['AUTO', 'MAX', 'TELEGRAM'])
  channel!: 'AUTO' | 'MAX' | 'TELEGRAM';

  @IsOptional()
  @IsIn(['MAX', 'TELEGRAM'])
  preferredChannel?: 'MAX' | 'TELEGRAM';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
