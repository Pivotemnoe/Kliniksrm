import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const dataTransferKinds = ['clients', 'history', 'catalog', 'stock'] as const;
export type DataTransferKind = (typeof dataTransferKinds)[number];

export class DataTransferRowDto {
  @IsInt()
  @Min(1)
  rowNumber!: number;

  @IsObject()
  data!: Record<string, string>;
}

export class DataTransferFieldMappingDto {
  @IsString()
  @MaxLength(240)
  sourceColumn!: string;

  @IsString()
  @MaxLength(120)
  targetField!: string;
}

export class PreviewDataTransferDto {
  @IsIn(dataTransferKinds)
  kind!: DataTransferKind;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sourceSystem!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsString()
  @Length(64, 64)
  fileChecksum!: string;

  @IsArray()
  @ArrayMaxSize(30000)
  @ValidateNested({ each: true })
  @Type(() => DataTransferRowDto)
  rows!: DataTransferRowDto[];

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DataTransferFieldMappingDto)
  mappings!: DataTransferFieldMappingDto[];
}
