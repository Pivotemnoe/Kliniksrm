import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelVaccinationDto {
  @ApiProperty({ description: 'Reason for removing an erroneous vaccination from the active history.' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
