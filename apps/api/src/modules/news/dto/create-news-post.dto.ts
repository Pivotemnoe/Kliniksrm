import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewsPriority } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNewsPostDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({ enum: NewsPriority })
  @IsOptional()
  @IsEnum(NewsPriority)
  priority?: NewsPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audienceRoleCodes?: string[];
}
