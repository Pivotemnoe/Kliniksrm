import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSchedulingResourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  officeId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name!: string;
}
