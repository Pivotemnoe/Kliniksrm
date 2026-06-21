import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOnlineRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  ownerName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  animalNickname!: string;

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
  @MaxLength(80)
  source?: string;
}
