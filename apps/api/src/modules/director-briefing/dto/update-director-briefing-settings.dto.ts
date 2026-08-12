import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateDirectorBriefingSettingsDto {
  @ApiProperty({ description: 'Формировать ежедневную сводку автоматически.' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ example: '08:00', description: 'Время формирования в формате ЧЧ:ММ.' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  time!: string;

  @ApiProperty({ example: 'Europe/Moscow', description: 'Часовой пояс сводки.' })
  @IsString()
  @MaxLength(80)
  timezone!: string;
}
