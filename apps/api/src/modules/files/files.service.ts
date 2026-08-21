import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientPortalStatus, FilePurpose, JobStatus, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { withRussianSearchVariants } from '../../common/search-ranking';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ObjectStorageService } from './object-storage.service';
import { ArchiveFileMetadataDto, UpdateArchiveFileMetadataDto } from './dto/archive-file-metadata.dto';
import { ListAnimalFilesQueryDto } from './dto/list-animal-files-query.dto';

export type UploadedFilePayload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type FileScope =
  | { kind: 'visit'; visitId: string; visitDocumentId?: string | null }
  | { kind: 'animal'; animalId: string; ownerId: string }
  | { kind: 'laboratory'; orderId: string; itemId?: string }
  | { kind: 'supply'; supplyInvoiceId: string };

const maxFileBytes = 15 * 1024 * 1024;
const allowedFiles = new Map<string, Set<string>>([
  ['.pdf', new Set(['application/pdf'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.png', new Set(['image/png'])],
  ['.webp', new Set(['image/webp'])],
  ['.docx', new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'])],
  ['.xlsx', new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'])],
  ['.xls', new Set(['application/vnd.ms-excel', 'application/octet-stream'])],
  ['.csv', new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'])],
]);

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly auditService: AuditService,
  ) {}

  async listVisitFiles(visitId: string) {
    await this.ensureVisitScope({ kind: 'visit', visitId });
    return this.list({ visitId, purpose: FilePurpose.MEDICAL_DOCUMENT });
  }

  async uploadVisitFile(visitId: string, visitDocumentId: string | undefined, file: UploadedFilePayload | undefined, actorId: string) {
    const scope: FileScope = { kind: 'visit', visitId, visitDocumentId: clean(visitDocumentId) };
    await this.ensureVisitScope(scope);
    return this.upload(scope, file, actorId);
  }

  async listAnimalFiles(animalId: string, query: ListAnimalFilesQueryDto = {}) {
    await this.ensureAnimalScope(animalId);
    const filters: Prisma.FileObjectWhereInput[] = [
      { purpose: FilePurpose.MEDICAL_DOCUMENT },
      { OR: [{ animalId }, { visit: { animalId } }] },
    ];
    const search = clean(query.search);
    if (search) {
      filters.push({
        OR: withRussianSearchVariants(search, (variant) => [
          { originalName: { contains: variant, mode: 'insensitive' as const } },
          { note: { contains: variant, mode: 'insensitive' as const } },
          { sourceLabel: { contains: variant, mode: 'insensitive' as const } },
        ]),
      });
    }
    if (query.category) filters.push({ archiveCategory: query.category });
    if (query.dateFrom || query.dateTo) {
      filters.push({
        documentDate: {
          ...(query.dateFrom ? { gte: startOfUtcDay(query.dateFrom) } : {}),
          ...(query.dateTo ? { lt: nextUtcDay(query.dateTo) } : {}),
        },
      });
    }
    return this.list({ AND: filters });
  }

  async uploadAnimalFile(
    animalId: string,
    file: UploadedFilePayload | undefined,
    actorId: string,
    metadata: ArchiveFileMetadataDto = {},
  ) {
    const animal = await this.ensureAnimalScope(animalId);
    return this.upload({ kind: 'animal', animalId, ownerId: animal.ownerId }, file, actorId, metadata);
  }

  async uploadAnimalFilesBatch(
    animalId: string,
    files: UploadedFilePayload[] | undefined,
    actorId: string,
    metadata: ArchiveFileMetadataDto = {},
  ) {
    const animal = await this.ensureAnimalScope(animalId);
    if (!files?.length) throw new BadRequestException('Выберите хотя бы один файл');
    if (files.length > 20) throw new BadRequestException('За один раз можно загрузить не более 20 файлов');

    const uploaded: Array<Prisma.FileObjectGetPayload<{ select: typeof publicFileSelect }>> = [];
    const duplicates: Array<{ originalName: string; existingFileId: string }> = [];
    const failed: Array<{ originalName: string; message: string }> = [];

    for (const file of files) {
      const originalName = normalizedOriginalName(file.originalname);
      try {
        this.validateFile(file, originalName);
        const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
        const duplicate = await this.prisma.fileObject.findFirst({
          where: {
            purpose: FilePurpose.MEDICAL_DOCUMENT,
            checksumSha256,
            deletedAt: null,
            OR: [{ animalId }, { visit: { animalId } }],
          },
          select: { id: true },
        });
        if (duplicate) {
          duplicates.push({ originalName, existingFileId: duplicate.id });
          continue;
        }
        uploaded.push(
          await this.upload({ kind: 'animal', animalId, ownerId: animal.ownerId }, file, actorId, metadata, false),
        );
      } catch (error) {
        failed.push({ originalName, message: readableUploadError(error) });
      }
    }

    await this.auditService.log({
      actorId,
      action: 'file.batch_upload',
      entityType: 'Animal',
      entityId: animalId,
      metadata: {
        requestedCount: files.length,
        uploadedCount: uploaded.length,
        duplicateCount: duplicates.length,
        failedCount: failed.length,
        archiveCategory: clean(metadata.archiveCategory),
      },
    });

    if (uploaded.length) await this.enqueueOwnerPortalSync(animal.ownerId, actorId).catch(() => undefined);

    return { uploaded, duplicates, failed };
  }

  async updateArchiveMetadata(fileId: string, dto: UpdateArchiveFileMetadataDto, actor: AuthEmployee) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { visit: { select: { animalId: true } } },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    if (file.purpose !== FilePurpose.MEDICAL_DOCUMENT || (!file.animalId && !file.visit?.animalId)) {
      throw new BadRequestException('Метаданные архива можно менять только у документов пациента');
    }
    this.ensurePurposePermission(file.purpose, actor, true);
    const updated = await this.prisma.fileObject.update({
      where: { id: file.id },
      data: archiveMetadataData(dto),
      select: publicFileSelect,
    });
    await this.auditService.log({
      actorId: actor.id,
      action: 'file.archive_metadata_update',
      entityType: 'FileObject',
      entityId: file.id,
      metadata: { changedFields: Object.keys(dto) },
    });
    const ownerId = await this.resolveFileOwnerId(file);
    if (ownerId) await this.enqueueOwnerPortalSync(ownerId, actor.id).catch(() => undefined);
    return updated;
  }

  async listLaboratoryFiles(orderId: string, itemId: string) {
    await this.ensureLaboratoryScope({ kind: 'laboratory', orderId, itemId });
    return this.list({ laboratoryOrderId: orderId, laboratoryOrderItemId: itemId, purpose: FilePurpose.LABORATORY_RESULT });
  }

  async listLaboratoryOrderFiles(orderId: string) {
    await this.ensureLaboratoryScope({ kind: 'laboratory', orderId });
    return this.list({ laboratoryOrderId: orderId, laboratoryOrderItemId: null, purpose: FilePurpose.LABORATORY_RESULT });
  }

  async uploadLaboratoryOrderFile(orderId: string, file: UploadedFilePayload | undefined, actorId: string) {
    const scope: FileScope = { kind: 'laboratory', orderId };
    await this.ensureLaboratoryScope(scope);
    return this.upload(scope, file, actorId);
  }

  async uploadLaboratoryFile(orderId: string, itemId: string, file: UploadedFilePayload | undefined, actorId: string) {
    const scope: FileScope = { kind: 'laboratory', orderId, itemId };
    await this.ensureLaboratoryScope(scope);
    return this.upload(scope, file, actorId);
  }

  async listSupplyFiles(supplyInvoiceId: string) {
    await this.ensureSupplyScope({ kind: 'supply', supplyInvoiceId });
    return this.list({ supplyInvoiceId, purpose: FilePurpose.SUPPLY_DOCUMENT });
  }

  async uploadSupplyFile(supplyInvoiceId: string, file: UploadedFilePayload | undefined, actorId: string) {
    const scope: FileScope = { kind: 'supply', supplyInvoiceId };
    await this.ensureSupplyScope(scope);
    return this.upload(scope, file, actorId);
  }

  async download(fileId: string, actor: AuthEmployee) {
    const file = await this.getActiveFile(fileId);
    this.ensurePurposePermission(file.purpose, actor, false);
    const stream = await this.storage.getObject(file.storageKey);
    const originalName = normalizedOriginalName(file.originalName);
    await this.auditService.log({
      actorId: actor.id,
      action: 'file.download',
      entityType: 'FileObject',
      entityId: file.id,
      metadata: { purpose: file.purpose, originalName },
    });
    return { file: { ...file, originalName }, stream };
  }

  async delete(fileId: string, actor: AuthEmployee) {
    const file = await this.getActiveFile(fileId);
    this.ensurePurposePermission(file.purpose, actor, true);
    const generatedDocument = await this.prisma.generatedDocument.findFirst({
      where: { fileId: file.id },
      select: { id: true },
    });
    if (generatedDocument) {
      throw new BadRequestException('Сформированный PDF является неизменяемой медицинской записью и не может быть удалён');
    }

    await this.storage.removeObject(file.storageKey);
    await this.prisma.fileObject.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
    await this.auditService.log({
      actorId: actor.id,
      action: 'file.delete',
      entityType: 'FileObject',
      entityId: file.id,
      metadata: { purpose: file.purpose, originalName: file.originalName },
    });
    const ownerId = file.purpose === FilePurpose.MEDICAL_DOCUMENT ? await this.resolveFileOwnerId(file) : null;
    if (ownerId) await this.enqueueOwnerPortalSync(ownerId, actor.id).catch(() => undefined);
    return { deleted: true };
  }

  private async list(where: Prisma.FileObjectWhereInput) {
    const files = await this.prisma.fileObject.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: publicFileSelect,
    });
    return files.map((file) => ({ ...file, originalName: normalizedOriginalName(file.originalName) }));
  }

  private async upload(
    scope: FileScope,
    file: UploadedFilePayload | undefined,
    actorId: string,
    archiveMetadata: ArchiveFileMetadataDto = {},
    enqueuePortal = true,
  ) {
    const originalName = normalizedOriginalName(file?.originalname ?? '');
    this.validateFile(file, originalName);
    const extension = extname(originalName).toLowerCase();
    const purpose = purposeFor(scope);
    const storageKey = `${purpose.toLowerCase()}/${new Date().getUTCFullYear()}/${randomUUID()}${extension}`;
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

    await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    try {
      const saved = await this.prisma.fileObject.create({
        data: {
          ...scopeData(scope),
          uploadedById: actorId,
          purpose,
          storageKey,
          originalName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
          ...(scope.kind === 'animal' ? archiveMetadataData(archiveMetadata) : {}),
        },
        select: publicFileSelect,
      });
      await this.auditService.log({
        actorId,
        action: 'file.upload',
        entityType: 'FileObject',
        entityId: saved.id,
        metadata: {
          purpose,
          originalName,
          sizeBytes: file.size,
          checksumSha256,
          ...(scope.kind === 'animal' ? { archiveCategory: clean(archiveMetadata.archiveCategory) } : {}),
        },
      });
      if (enqueuePortal && purpose === FilePurpose.MEDICAL_DOCUMENT) {
        const ownerId = scope.kind === 'animal'
          ? scope.ownerId
          : scope.kind === 'visit'
            ? await this.resolveVisitOwnerId(scope.visitId)
            : null;
        if (ownerId) await this.enqueueOwnerPortalSync(ownerId, actorId).catch(() => undefined);
      }
      return saved;
    } catch (error) {
      await this.storage.removeObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  private validateFile(file: UploadedFilePayload | undefined, originalName: string): asserts file is UploadedFilePayload {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Выберите непустой файл');
    }
    if (file.size > maxFileBytes) {
      throw new BadRequestException('Файл больше 15 МБ. Уменьшите его и повторите загрузку');
    }
    const extension = extname(originalName).toLowerCase();
    const mimeTypes = allowedFiles.get(extension);
    if (!mimeTypes || !mimeTypes.has(file.mimetype.toLowerCase())) {
      throw new BadRequestException('Допустимы PDF, JPG, PNG, WEBP, DOCX, XLSX, XLS и CSV');
    }
  }

  private async ensureVisitScope(scope: Extract<FileScope, { kind: 'visit' }>) {
    const visit = await this.prisma.visit.findUnique({ where: { id: scope.visitId }, select: { id: true } });
    if (!visit) throw new NotFoundException('Приём не найден');
    if (scope.visitDocumentId) {
      const document = await this.prisma.visitDocument.findFirst({
        where: { id: scope.visitDocumentId, visitId: scope.visitId },
        select: { id: true },
      });
      if (!document) throw new NotFoundException('Документ этого приёма не найден');
    }
  }

  private async ensureAnimalScope(animalId: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      select: { id: true, ownerId: true },
    });
    if (!animal) throw new NotFoundException('Пациент не найден');
    return animal;
  }

  private async ensureLaboratoryScope(scope: Extract<FileScope, { kind: 'laboratory' }>) {
    if (!scope.itemId) {
      const order = await this.prisma.laboratoryOrder.findUnique({ where: { id: scope.orderId }, select: { id: true } });
      if (!order) throw new NotFoundException('Лабораторный заказ не найден');
      return;
    }
    const item = await this.prisma.laboratoryOrderItem.findFirst({
      where: { id: scope.itemId, orderId: scope.orderId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Анализ в лабораторном заказе не найден');
  }

  private async ensureSupplyScope(scope: Extract<FileScope, { kind: 'supply' }>) {
    const invoice = await this.prisma.supplyInvoice.findUnique({ where: { id: scope.supplyInvoiceId }, select: { id: true } });
    if (!invoice) throw new NotFoundException('Накладная поставки не найдена');
  }

  private async getActiveFile(fileId: string) {
    const file = await this.prisma.fileObject.findFirst({ where: { id: fileId, deletedAt: null } });
    if (!file) throw new NotFoundException('Файл не найден');
    return file;
  }

  private async resolveVisitOwnerId(visitId: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId }, select: { ownerId: true } });
    return visit?.ownerId ?? null;
  }

  private async resolveFileOwnerId(file: { ownerId: string | null; animalId: string | null; visitId: string | null }) {
    if (file.ownerId) return file.ownerId;
    if (file.animalId) {
      const animal = await this.prisma.animal.findUnique({ where: { id: file.animalId }, select: { ownerId: true } });
      if (animal) return animal.ownerId;
    }
    return file.visitId ? this.resolveVisitOwnerId(file.visitId) : null;
  }

  private async enqueueOwnerPortalSync(ownerId: string, actorId: string) {
    const access = await this.prisma.clientPortalAccess.findUnique({
      where: { ownerId },
      select: { status: true },
    });
    if (!access || access.status === ClientPortalStatus.DISABLED) return;

    const now = new Date().toISOString();
    await this.prisma.backgroundJob.create({
      data: {
        queueName: 'owner-gateway-snapshot',
        jobName: 'sync-owner-snapshot',
        status: JobStatus.PENDING,
        payload: {
          ownerId,
          visitId: null,
          visitStatus: null,
          actorId,
          attempts: 0,
          nextAttemptAt: now,
        },
      },
    });
  }

  private ensurePurposePermission(purpose: FilePurpose, actor: AuthEmployee, manage: boolean) {
    const required =
      purpose === FilePurpose.LABORATORY_RESULT
        ? `laboratory.${manage ? 'manage' : 'read'}`
        : purpose === FilePurpose.SUPPLY_DOCUMENT
          ? `stock.${manage ? 'manage' : 'read'}`
          : `documents.${manage ? 'manage' : 'read'}`;
    if (!actor.permissions.includes(required)) {
      throw new ForbiddenException('Недостаточно прав для этого файла');
    }
  }
}

const publicFileSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  checksumSha256: true,
  archiveCategory: true,
  documentDate: true,
  sourceLabel: true,
  note: true,
  purpose: true,
  uploadedById: true,
  uploadedBy: { select: { id: true, fullName: true } },
  createdAt: true,
} satisfies Prisma.FileObjectSelect;

function scopeData(scope: FileScope): Prisma.FileObjectUncheckedCreateInput {
  if (scope.kind === 'visit') {
    return { visitId: scope.visitId, visitDocumentId: scope.visitDocumentId ?? null, storageKey: '', originalName: '' };
  }
  if (scope.kind === 'animal') {
    return { ownerId: scope.ownerId, animalId: scope.animalId, storageKey: '', originalName: '' };
  }
  if (scope.kind === 'laboratory') {
    return { laboratoryOrderId: scope.orderId, laboratoryOrderItemId: scope.itemId ?? null, storageKey: '', originalName: '' };
  }
  return { supplyInvoiceId: scope.supplyInvoiceId, storageKey: '', originalName: '' };
}

function purposeFor(scope: FileScope) {
  if (scope.kind === 'laboratory') return FilePurpose.LABORATORY_RESULT;
  if (scope.kind === 'supply') return FilePurpose.SUPPLY_DOCUMENT;
  return FilePurpose.MEDICAL_DOCUMENT;
}

function safeOriginalName(value: string) {
  const normalized = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_').trim();
  return (normalized || 'файл').slice(0, 240);
}

function normalizedOriginalName(value: string) {
  return safeOriginalName(decodeMojibakeFileName(value));
}

function decodeMojibakeFileName(value: string) {
  const markerCount = (value.match(/[ÃÂÐÑ]/g) ?? []).length;
  if (!markerCount) return value;

  const candidate = Buffer.from(value, 'latin1').toString('utf8');
  const candidateMarkerCount = (candidate.match(/[ÃÂÐÑ]/g) ?? []).length;
  const looksLikeReadableCyrillic = /[А-Яа-яЁё]/.test(candidate);
  if (!candidate.includes('\uFFFD') && looksLikeReadableCyrillic && candidateMarkerCount < markerCount) {
    return candidate;
  }
  return value;
}

function clean(value?: string | null) {
  const result = value?.trim();
  return result || null;
}

function archiveMetadataData(metadata: ArchiveFileMetadataDto | UpdateArchiveFileMetadataDto) {
  return {
    ...(metadata.archiveCategory !== undefined ? { archiveCategory: clean(metadata.archiveCategory) } : {}),
    ...(metadata.documentDate !== undefined
      ? { documentDate: metadata.documentDate ? startOfUtcDay(metadata.documentDate) : null }
      : {}),
    ...(metadata.sourceLabel !== undefined ? { sourceLabel: clean(metadata.sourceLabel) } : {}),
    ...(metadata.note !== undefined ? { note: clean(metadata.note) } : {}),
  } satisfies Prisma.FileObjectUncheckedUpdateInput;
}

function startOfUtcDay(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Укажите корректную дату документа');
  return date;
}

function nextUtcDay(value: string) {
  const date = startOfUtcDay(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function readableUploadError(error: unknown) {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;
      return Array.isArray(message) ? message.join(', ') : message || 'Файл не загружен';
    }
  }
  return error instanceof Error ? error.message : 'Файл не загружен';
}
