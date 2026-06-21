import { PartialType } from '@nestjs/swagger';
import { UpsertServiceDto } from './upsert-service.dto';

export class UpdateServiceDto extends PartialType(UpsertServiceDto) {}
