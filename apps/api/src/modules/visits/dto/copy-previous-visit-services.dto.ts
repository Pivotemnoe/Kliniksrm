import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class CopyPreviousVisitServicesDto {
  @ApiProperty({ type: [String], description: 'Positions selected from the immediately preceding visit.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  itemIds!: string[];
}
