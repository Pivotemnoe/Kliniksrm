import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import { ArrayUnique, IsArray, IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiPropertyOptional({ description: 'Required for direct channels; selected automatically for MESSENGER.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  recipient?: string;

  @ApiPropertyOptional({
    enum: [NotificationChannel.MAX, NotificationChannel.TELEGRAM],
    isArray: true,
    description: 'Additional messenger deliveries for an owner message. An empty list means personal cabinet only.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([NotificationChannel.MAX, NotificationChannel.TELEGRAM], { each: true })
  messengerChannels?: NotificationChannel[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  animalId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
}
