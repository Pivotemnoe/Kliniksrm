import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class LinkedProductDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: 'Количество в единицах использования связанного товара.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Нижняя граница объёма препарата в мл, не включительно.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minDoseMl?: number;

  @ApiPropertyOptional({ description: 'Верхняя граница объёма препарата в мл, включительно.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  maxDoseMl?: number;
}
