import { ApiProperty } from '@nestjs/swagger';
import { ClientPortalStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePortalAccessDto {
  @ApiProperty({ enum: ClientPortalStatus })
  @IsEnum(ClientPortalStatus)
  status!: ClientPortalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  blockedReason?: string | null;
}
