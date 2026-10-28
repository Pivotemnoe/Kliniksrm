import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class NativePushDeviceDto {
  @IsUUID('4') installationId!: string;
  @IsIn(['ANDROID', 'IOS']) platform!: string;
  @IsString() @MinLength(3) @MaxLength(200) applicationId!: string;
  @IsString() @MinLength(32) @MaxLength(4096) token!: string;
  @IsOptional() @IsIn(['SANDBOX', 'PRODUCTION']) environment?: string;
}
