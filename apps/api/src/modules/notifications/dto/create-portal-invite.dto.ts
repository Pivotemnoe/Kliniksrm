import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export enum PortalInviteChannel {
  MAX = 'MAX',
  TELEGRAM = 'TELEGRAM',
  WEB = 'WEB',
}

export class CreatePortalInviteDto {
  @ApiProperty({ enum: PortalInviteChannel })
  @IsEnum(PortalInviteChannel)
  channel!: PortalInviteChannel;

  @IsOptional()
  @IsBoolean()
  onlyIfNotActivated?: boolean;
}
