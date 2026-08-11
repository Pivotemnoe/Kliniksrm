import { BusinessCategoryType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertBusinessCategoryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  @MaxLength(80)
  code?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsEnum(BusinessCategoryType)
  type!: BusinessCategoryType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]+$/)
  @MaxLength(80)
  groupCode?: string;

  @IsBoolean()
  affectsProfit!: boolean;

  @IsOptional()
  @IsBoolean()
  administratorAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}
