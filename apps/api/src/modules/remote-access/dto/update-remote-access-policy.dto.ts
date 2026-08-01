import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateRemoteAccessPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ minimum: 5, maximum: 30 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
  enrollmentTtlMinutes?: number;

  @ApiPropertyOptional({ minimum: 5, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  idleTimeoutMinutes?: number;
}
