import { ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalPhraseSource } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination';

export class ManageMedicalPhrasesQueryDto implements PaginationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offset?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  field?: string;

  @ApiPropertyOptional({ enum: MedicalPhraseSource })
  @IsOptional()
  @IsEnum(MedicalPhraseSource)
  source?: MedicalPhraseSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  species?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  isActive?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
