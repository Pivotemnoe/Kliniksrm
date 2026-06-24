import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultRoute?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  restrictLoginToShifts?: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @ApiProperty({ example: ['doctor'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleCodes!: string[];

  @ApiPropertyOptional({ example: ['documents.manage'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionGrants?: string[];

  @ApiPropertyOptional({ example: ['stock.manage'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionDenials?: string[];

  @ApiPropertyOptional({ example: ['warehouse-id'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warehouseIds?: string[];
}
