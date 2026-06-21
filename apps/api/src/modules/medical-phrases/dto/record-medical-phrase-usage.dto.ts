import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RecordMedicalPhraseUsageDto {
  @ApiProperty()
  @IsUUID()
  phraseId!: string;
}
