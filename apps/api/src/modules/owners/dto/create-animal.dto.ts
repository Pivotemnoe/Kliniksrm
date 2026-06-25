import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

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

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  species!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  breed!: string;

  @ApiPropertyOptional({ enum: AnimalSexDto })
  @IsOptional()
  @IsEnum(AnimalSexDto)
  sex?: AnimalSexDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: 'Дата рождения должна быть в формате ГГГГ-ММ-ДД' })
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  microchip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSterilized?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;
}
