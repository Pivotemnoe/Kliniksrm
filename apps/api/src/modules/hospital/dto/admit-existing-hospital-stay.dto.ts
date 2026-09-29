import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max, IsString, IsUUID } from 'class-validator';

export class AdmitExistingHospitalStayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dailyServiceId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  dailyServicePrice?: number;

  @ApiProperty()
  @IsUUID()
  hospitalBoxId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
