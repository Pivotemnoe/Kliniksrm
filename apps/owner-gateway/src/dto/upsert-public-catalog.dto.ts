import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsISO8601, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class PublicCatalogItemDto {
  @IsString() @MinLength(1) @MaxLength(80) id!: string;
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsString() @MinLength(1) @MaxLength(160) category!: string;
  @IsIn(['FIXED', 'RANGE', 'ON_REQUEST']) priceType!: 'FIXED' | 'RANGE' | 'ON_REQUEST';
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) price?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) minimumPrice?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) maximumPrice?: number | null;
}
export class UpsertPublicCatalogDto {
  @IsISO8601({ strict: true }) capturedAt!: string;
  @IsIn(['RUB']) currency!: 'RUB';
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => PublicCatalogItemDto)
  items!: PublicCatalogItemDto[];
}
