import { ApiPropertyOptional } from '@nestjs/swagger';
import { OnlineRequestStatus } from '@prisma/client';
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateOnlineRequestDto {
  @ApiPropertyOptional({ enum: OnlineRequestStatus })
  @IsOptional()
  @IsEnum(OnlineRequestStatus)
  status?: OnlineRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  animalNickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  animalSpecies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  animalBreed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  preferredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalComment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  animalId?: string;
}
