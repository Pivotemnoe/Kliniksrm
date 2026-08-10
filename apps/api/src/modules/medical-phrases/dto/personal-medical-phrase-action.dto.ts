import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const personalMedicalPhraseActions = ['ACCEPT', 'REJECT', 'PIN', 'UNPIN'] as const;
export type PersonalMedicalPhraseAction = (typeof personalMedicalPhraseActions)[number];

export class PersonalMedicalPhraseActionDto {
  @ApiProperty({ enum: personalMedicalPhraseActions })
  @IsIn(personalMedicalPhraseActions)
  action!: PersonalMedicalPhraseAction;
}
