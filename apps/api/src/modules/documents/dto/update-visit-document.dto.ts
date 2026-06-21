import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DocumentStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateVisitDocumentDto } from './create-visit-document.dto';

export class UpdateVisitDocumentDto extends PartialType(CreateVisitDocumentDto) {
  @ApiPropertyOptional({ enum: DocumentStatus })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;
}
