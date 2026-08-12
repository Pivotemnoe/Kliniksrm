import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RestoreVisitDto {
  @ApiProperty({ description: 'Причина возврата отменённого приёма в работу.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
