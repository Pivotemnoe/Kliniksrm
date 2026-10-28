import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateInternalMessageDto {
  @IsOptional() @IsUUID() clientKey?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  recipientId!: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  body!: string;
}
