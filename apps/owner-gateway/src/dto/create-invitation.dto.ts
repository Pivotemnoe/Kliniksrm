import { IsEnum, IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';
import { PortalInviteChannel } from '../generated/client';

export class CreateInvitationDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;

  @IsEnum(PortalInviteChannel)
  channel!: PortalInviteChannel;

  @IsISO8601()
  expiresAt!: string;
}
