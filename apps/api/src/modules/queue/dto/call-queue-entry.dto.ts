import { IsUUID } from 'class-validator';

export class CallQueueEntryDto {
  @IsUUID()
  deviceId!: string;
}
