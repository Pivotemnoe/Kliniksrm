import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class VerifyPortalCodeDto {
  @ApiProperty({ example: '+7 928 000-00-00' })
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;
}
