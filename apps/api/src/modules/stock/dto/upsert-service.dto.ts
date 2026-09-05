import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { LinkedProductDto } from './linked-product.dto';

export class UpsertServiceDto {
  @ApiPropertyOptional({ description: 'Publish the service title, category and price on the clinic website.' })
  @IsOptional()
  @IsBoolean()
  publicOnWebsite?: boolean;

  @ApiProperty()
  @IsString()
  @MaxLength(240)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  categoryTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: ['FIXED', 'FLOATING'] })
  @IsOptional()
  @IsString()
  @IsIn(['FIXED', 'FLOATING'])
  priceType?: string;

  @ApiPropertyOptional({ description: 'Inclusive lower boundary for a floating price.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumPrice?: number;

  @ApiPropertyOptional({ description: 'Inclusive upper boundary for a floating price.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [LinkedProductDto], description: 'Расходники, которые списываются при выполнении услуги.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LinkedProductDto)
  linkedProducts?: LinkedProductDto[];
}
