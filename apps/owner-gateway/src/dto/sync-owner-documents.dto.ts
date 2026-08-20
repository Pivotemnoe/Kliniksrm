import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class OwnerDocumentMetadataDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  animalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  animalName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  fileName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15 * 1024 * 1024)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  checksumSha256?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  archiveCategory?: string;

  @IsOptional()
  @IsISO8601()
  documentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceLabel?: string;

  @IsISO8601()
  sourceCreatedAt!: string;
}

export class SyncOwnerDocumentsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OwnerDocumentMetadataDto)
  documents!: OwnerDocumentMetadataDto[];
}

export class UploadOwnerDocumentContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  checksumSha256?: string;

  @IsString()
  @MinLength(1)
  contentBase64!: string;
}
