import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { AddVisitServiceDto } from './add-visit-service.dto';

export class AddVisitServicesDto {
  @ApiProperty({ type: [AddVisitServiceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AddVisitServiceDto)
  items!: AddVisitServiceDto[];
}
