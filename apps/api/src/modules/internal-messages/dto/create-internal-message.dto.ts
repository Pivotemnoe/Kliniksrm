import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateInternalMessageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  recipientId!: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  body!: string;
}
