import { IsISO8601, IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertOwnerSnapshotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  displayName!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sourceVersion!: string;

  @IsISO8601()
  sourceUpdatedAt!: string;
}
