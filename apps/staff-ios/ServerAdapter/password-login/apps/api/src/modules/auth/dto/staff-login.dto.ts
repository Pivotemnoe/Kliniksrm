import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LoginDto } from './login.dto';

export class StaffLoginDto extends LoginDto {
  @ApiProperty({ description: 'Stable installation identifier generated and kept by the app.' })
  @IsUUID('4')
  installationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
