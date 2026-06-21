import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestPortalCodeDto {
  @ApiProperty({ example: '+7 928 000-00-00' })
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone!: string;
}
