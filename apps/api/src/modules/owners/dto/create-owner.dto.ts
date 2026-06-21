import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateOwnerDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  extraPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  passportData?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  preferredNotificationChannel?: NotificationChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  telegramChatId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  maxUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowSms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowTelegram?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowMax?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  goodsDiscount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  servicesDiscount?: number;
}
