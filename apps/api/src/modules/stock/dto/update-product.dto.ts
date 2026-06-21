import { PartialType } from '@nestjs/swagger';
import { UpsertProductDto } from './upsert-product.dto';

export class UpdateProductDto extends PartialType(UpsertProductDto) {}
