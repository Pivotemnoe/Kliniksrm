import { IsString, MaxLength, MinLength } from 'class-validator';

export class MarkBookingRequestImportedDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  crmRequestId!: string;
}
