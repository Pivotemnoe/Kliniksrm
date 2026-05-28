import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertVisitRecommendationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  treatmentPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  careNotes?: string;
}
