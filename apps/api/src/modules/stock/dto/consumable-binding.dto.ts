import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class ConsumableAmountDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(999999) quantity!: number;
}
export class ConsumableBindingDto {
  @IsIn(['SERVICE', 'PRODUCT']) targetKind!: 'SERVICE' | 'PRODUCT';
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) targetIds!: string[];
  @IsIn(['MERGE', 'REPLACE']) mode!: 'MERGE' | 'REPLACE';
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ConsumableAmountDto) items!: ConsumableAmountDto[];
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) previewToken?: string;
}
export class ConsumableSetDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ConsumableAmountDto) items!: ConsumableAmountDto[];
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) serviceIds!: string[];
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) productIds!: string[];
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
}
