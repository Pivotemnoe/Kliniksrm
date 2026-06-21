import { ApiPropertyOptional } from '@nestjs/swagger';
import { AnimalSex, QueueStatus, QueueUrgency } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateQueueEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  officeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  animalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roomId?: string;

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
  @IsString()
  @MaxLength(500)
  ownerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  animalNickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  animalSpecies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  animalBreed?: string;

  @ApiPropertyOptional({ enum: AnimalSex })
  @IsOptional()
  @IsEnum(AnimalSex)
  animalSex?: AnimalSex;

  @ApiPropertyOptional({ enum: QueueUrgency })
  @IsOptional()
  @IsEnum(QueueUrgency)
  urgency?: QueueUrgency;

  @ApiPropertyOptional({ enum: QueueStatus })
  @IsOptional()
  @IsEnum(QueueStatus)
  status?: QueueStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
