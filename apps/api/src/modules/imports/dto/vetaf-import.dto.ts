import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, Min, ValidateNested } from 'class-validator';

export type VetafImportKind = 'clients' | 'stock';

export class VetafImportRowDto {
  @IsInt()
  @Min(1)
  rowNumber!: number;

  @IsObject()
  data!: Record<string, string>;
}

export class VetafImportDto {
  @IsIn(['clients', 'stock'])
  kind!: VetafImportKind;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => VetafImportRowDto)
  rows!: VetafImportRowDto[];
}
