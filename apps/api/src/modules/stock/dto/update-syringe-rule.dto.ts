import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateSyringeRuleDto {
  @ApiProperty() @IsUUID() syringe1ProductId!: string;
  @ApiProperty() @IsUUID() syringe2ProductId!: string;
  @ApiProperty() @IsUUID() syringe5ProductId!: string;
  @ApiProperty() @IsUUID() syringe10ProductId!: string;
}
