import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeShiftDto {
  @ApiProperty()
  @IsString()
  employeeId!: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
