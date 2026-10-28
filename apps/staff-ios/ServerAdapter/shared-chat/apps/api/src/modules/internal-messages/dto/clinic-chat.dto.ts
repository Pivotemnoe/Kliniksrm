import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class ClinicChatSendDto {
  @IsUUID('4') clientKey!: string;
  @IsString() @MaxLength(4000) body!: string;
}
export class ClinicChatQueryDto {
  @IsOptional() @Matches(/^\d{1,20}$/) beforeSequence?: string;
  @IsOptional() @IsString() limit?: string;
}
export class ClinicChatReadDto { @IsUUID() throughId!: string; }
