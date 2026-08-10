import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const patientArchiveCategories = [
  'История лечения',
  'Анализы',
  'Заключения',
  'Согласия',
  'Выписки',
  'Изображения',
  'Прочее',
] as const;

export class ArchiveFileMetadataDto {
  @ApiPropertyOptional({ enum: patientArchiveCategories })
  @IsOptional()
  @IsIn(patientArchiveCategories)
  archiveCategory?: string;

  @ApiPropertyOptional({ example: '2026-08-10' })
  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @ApiPropertyOptional({ example: 'Предыдущая клиника' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateArchiveFileMetadataDto extends PartialType(ArchiveFileMetadataDto) {}
