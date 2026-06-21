import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  recipient!: string;

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
