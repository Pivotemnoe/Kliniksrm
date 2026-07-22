import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateEmployeeShiftDto } from './create-employee-shift.dto';

export class CreateEmployeeShiftsBulkDto {
  @ApiProperty({ type: [CreateEmployeeShiftDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeShiftDto)
  shifts!: CreateEmployeeShiftDto[];
}
