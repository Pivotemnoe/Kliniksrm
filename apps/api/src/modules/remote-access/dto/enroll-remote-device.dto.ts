import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class EnrollRemoteDeviceDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  deviceName?: string;
}
