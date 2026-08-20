import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RegisterQueueWorkstationDto {
  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class UpdateQueueWorkstationDto {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
