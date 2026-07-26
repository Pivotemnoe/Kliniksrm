import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

export class AcceptServerDto {
  @IsString()
  @Equals('ACCEPT_NEW_SERVER')
  confirmation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
