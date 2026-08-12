import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AnimalArchiveReason {
  DECEASED = 'DECEASED',
  ERRONEOUS = 'ERRONEOUS',
  OTHER = 'OTHER',
}

export class ArchiveAnimalDto {
  @ApiProperty({ enum: AnimalArchiveReason })
  @IsEnum(AnimalArchiveReason)
  reason!: AnimalArchiveReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
