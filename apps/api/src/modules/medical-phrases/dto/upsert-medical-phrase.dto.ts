import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalPhraseSource } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertMedicalPhraseDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  field!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  species?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  diagnosis?: string | null;

  @ApiPropertyOptional({ enum: MedicalPhraseSource })
  @IsOptional()
  @IsEnum(MedicalPhraseSource)
  source?: MedicalPhraseSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
