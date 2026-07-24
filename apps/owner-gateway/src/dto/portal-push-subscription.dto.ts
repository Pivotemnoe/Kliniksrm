import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class PortalPushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(4096)
  endpoint!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  auth!: string;
}

export class RemovePortalPushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(4096)
  endpoint!: string;
}
