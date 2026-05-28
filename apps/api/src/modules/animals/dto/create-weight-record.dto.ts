import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateWeightRecordDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.001)
  @Max(9999)
  weightKg!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  measuredAt?: string;
}

