import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateSchedulingResourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  dailyServiceIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  officeId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ description: 'Стоимость календарного дня в боксе, если услуга не выбрана.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  dailyRate?: number;
}
