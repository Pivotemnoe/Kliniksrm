import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateBusinessEntryDto } from './create-business-entry.dto';

export class CreateBusinessEntriesBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateBusinessEntryDto)
  entries!: CreateBusinessEntryDto[];
}
