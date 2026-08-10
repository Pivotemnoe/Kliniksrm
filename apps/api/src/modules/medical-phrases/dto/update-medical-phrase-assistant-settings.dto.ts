import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateMedicalPhraseAssistantSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
