import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class UpsertServiceDto {
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
}
