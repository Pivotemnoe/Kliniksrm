import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeOwnerDto {
  @ApiProperty({ description: 'Карточка-дубль, которую нужно перенести в текущего владельца.' })
  @IsUUID()
  sourceOwnerId!: string;
}
