import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListInternalMessagesQueryDto {
  @IsOptional() @IsUUID() beforeId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({ default: '100' })
  @IsOptional()
  @IsString()
  limit?: string;
}
