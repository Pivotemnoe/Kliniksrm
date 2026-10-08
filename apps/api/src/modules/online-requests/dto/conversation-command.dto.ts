import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
export class ConversationCommandDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,100}$/) clientKey!: string;
  @IsIn(['REPLY', 'RESUME', 'RESOLVE']) action!: 'REPLY' | 'RESUME' | 'RESOLVE';
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
}
