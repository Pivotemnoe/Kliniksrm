import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export enum AnimalSexDto {
  Male = 'MALE',
  Female = 'FEMALE',
  Unknown = 'UNKNOWN',
}

export class CreateAnimalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nickname!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  species?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  breed?: string;

  @ApiPropertyOptional({ enum: AnimalSexDto })
  @IsOptional()
  @IsEnum(AnimalSexDto)
  sex?: AnimalSexDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  microchip?: string;
}
