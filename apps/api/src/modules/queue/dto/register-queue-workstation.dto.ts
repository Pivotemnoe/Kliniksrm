import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
  roomId?: string | null;

  @IsOptional()
  @IsBoolean()
  isReception?: boolean;

  @IsOptional()
  @IsIn(['Приёмная 1', 'Приёмная 2', 'Процедурная', 'Стационар'])
  roomName?: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class CallQueueEntryDto {
  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;
}
