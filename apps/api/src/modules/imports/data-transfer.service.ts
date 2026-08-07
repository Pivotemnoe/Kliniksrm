import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AnimalSex,
  BillSource,
  DataTransferAction,
  DataTransferRowStatus,
  DataTransferStatus,
  PaymentStatus,
  Prisma,
  StockMovementType,
  VisitStatus,
  VisitType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  formatNormalizedRussianPhone,
  normalizeDisplayName,
  normalizePersonNameKey,
  normalizePhoneForLookup,
} from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { DataTransferKind, PreviewDataTransferDto } from './dto/data-transfer.dto';

type Tx = Prisma.TransactionClient;
type NormalizedRow = Record<string, string | null>;
type TransferIssue = { rowNumber: number; level: 'error' | 'warning'; field?: string; message: string };
type PreviewPreparedRow = { rowNumber: number; normalizedData: NormalizedRow; fingerprint: string };
type PreviewMatchResult = {
  issues: TransferIssue[];
  matchedRecords: number;
  matchedByType: Record<string, number>;
};

const targetFields: Record<DataTransferKind, Array<{ value: string; label: string; required?: boolean }>> = {
  clients: [
    { value: 'source_id', label: 'ID в прежней системе' },
    { value: 'owner_source_id', label: 'ID владельца в прежней системе' },
    { value: 'animal_source_id', label: 'ID пациента в прежней системе' },
    { value: 'owner_name', label: 'ФИО владельца' },
    { value: 'phone', label: 'Телефон' },
    { value: 'extra_phone', label: 'Дополнительный телефон' },
    { value: 'email', label: 'Email' },
    { value: 'address', label: 'Адрес' },
    { value: 'owner_comment', label: 'Комментарий владельца' },
    { value: 'animal_name', label: 'Кличка пациента' },
    { value: 'species', label: 'Вид' },
    { value: 'animal_status', label: 'Статус пациента' },
    { value: 'breed', label: 'Порода' },
    { value: 'sex', label: 'Пол' },
    { value: 'birth_date', label: 'Дата рождения' },
    { value: 'microchip', label: 'Микрочип' },
    { value: 'animal_comment', label: 'Комментарий пациента' },
    { value: 'vaccination_title', label: 'Вакцинация' },
    { value: 'vaccinated_at', label: 'Дата вакцинации' },
    { value: 'vaccination_due_at', label: 'Следующая вакцинация' },
    { value: 'vaccination_series', label: 'Серия вакцины' },
  ],
  history: [
    { value: 'source_id', label: 'ID записи в прежней системе' },
    { value: 'owner_name', label: 'ФИО владельца' },
    { value: 'phone', label: 'Телефон' },
    { value: 'animal_name', label: 'Кличка пациента' },
    { value: 'species', label: 'Вид' },
    { value: 'breed', label: 'Порода' },
    { value: 'microchip', label: 'Микрочип' },
    { value: 'visit_date', label: 'Дата приёма', required: true },
    { value: 'doctor', label: 'Врач' },
    { value: 'visit_type', label: 'Тип приёма' },
    { value: 'purpose', label: 'Причина обращения' },
    { value: 'anamnesis', label: 'Анамнез' },
    { value: 'examination', label: 'Осмотр' },
    { value: 'symptoms', label: 'Симптомы' },
    { value: 'manipulations', label: 'Манипуляции' },
    { value: 'diagnosis', label: 'Диагноз' },
    { value: 'diagnosis_description', label: 'Описание диагноза' },
    { value: 'treatment_plan', label: 'Назначения' },
    { value: 'care_notes', label: 'Рекомендации' },
    { value: 'amount', label: 'Сумма счёта' },
    { value: 'bill_status', label: 'Статус оплаты' },
    { value: 'document_title', label: 'Название документа' },
    { value: 'document_body', label: 'Текст документа' },
  ],
  catalog: [
    { value: 'source_id', label: 'ID в прежней системе' },
    { value: 'item_type', label: 'Тип: товар или услуга' },
    { value: 'title', label: 'Наименование', required: true },
    { value: 'category', label: 'Категория' },
    { value: 'sku', label: 'Артикул' },
    { value: 'barcode', label: 'Штрихкод' },
    { value: 'price', label: 'Цена' },
    { value: 'minimum_price', label: 'Минимальная цена' },
    { value: 'price_type', label: 'Тип цены' },
    { value: 'unit', label: 'Единица' },
    { value: 'min_stock', label: 'Минимальный остаток' },
    { value: 'description', label: 'Описание' },
    { value: 'price_note', label: 'Цена в исходном файле' },
    { value: 'review_status', label: 'Отметка «требует проверки»' },
  ],
  stock: [
    { value: 'source_id', label: 'ID в прежней системе' },
    { value: 'title', label: 'Наименование', required: true },
    { value: 'category', label: 'Категория' },
    { value: 'sku', label: 'Артикул' },
    { value: 'barcode', label: 'Штрихкод' },
    { value: 'unit', label: 'Единица' },
    { value: 'quantity', label: 'Остаток', required: true },
    { value: 'price', label: 'Цена продажи' },
    { value: 'purchase_price', label: 'Закупочная цена' },
    { value: 'min_stock', label: 'Минимальный остаток' },
    { value: 'warehouse', label: 'Склад' },
    { value: 'expires_at', label: 'Срок годности' },
    { value: 'series', label: 'Серия' },
    { value: 'description', label: 'Описание' },
  ],
};

@Injectable()
export class DataTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(actor: AuthEmployee) {
    const permissions = new Set(actor.permissions);
    const canReadClinicalTransfers = permissions.has('*') || (permissions.has('owners.manage') && permissions.has('animals.manage'));
    const canReadStockTransfers = permissions.has('*') || permissions.has('stock.manage');
    if (!canReadClinicalTransfers && !canReadStockTransfers) {
      throw new ForbiddenException('Недостаточно прав для журнала переноса');
    }
    const allowedKinds: DataTransferKind[] = [
      ...(canReadClinicalTransfers ? ['clients', 'history'] as const : []),
      ...(canReadStockTransfers ? ['catalog', 'stock'] as const : []),
    ];
    const batches = await this.prisma.dataTransferBatch.findMany({
      where: { kind: { in: allowedKinds } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { fieldMappings: true },
    });
    return { targetFields, batches: batches.map((batch) => this.presentBatch(batch)) };
  }

  async preview(dto: PreviewDataTransferDto, actor: AuthEmployee) {
    this.ensurePermission(dto.kind, actor);
    ensureImportFileAllowed(dto.fileName);
    if (!dto.sourceSystem.trim()) {
      throw new BadRequestException('Укажите, откуда переносятся данные');
    }
    if (!dto.rows.length) {
      throw new BadRequestException('В файле нет строк данных');
    }
    if (!/^[a-f0-9]{64}$/i.test(dto.fileChecksum)) {
      throw new BadRequestException('Контрольная сумма файла имеет неверный формат');
    }

    const mappings = this.validateMappings(dto);
    const existing = await this.prisma.dataTransferBatch.findUnique({
      where: {
        sourceSystem_kind_fileChecksum: {
          sourceSystem: dto.sourceSystem.trim(),
          kind: dto.kind,
          fileChecksum: dto.fileChecksum.toLowerCase(),
        },
      },
      include: { fieldMappings: true },
    });
    if (existing && !['DRAFT', 'PREVIEWED', 'FAILED', 'ROLLED_BACK'].includes(existing.status)) {
      return { ...this.presentBatch(existing), repeatProtected: true };
    }

    const rowNumbers = new Set<number>();
    for (const row of dto.rows) {
      if (rowNumbers.has(row.rowNumber)) {
        throw new BadRequestException(`Номер строки указан дважды: ${row.rowNumber}`);
      }
      rowNumbers.add(row.rowNumber);
    }

    const issues: TransferIssue[] = [];
    const baseRows = dto.rows.map((row) => {
      const normalized = applyMappings(row.data, mappings);
      const rowIssues = validateRow(dto.kind, row.rowNumber, normalized);
      issues.push(...rowIssues);
      return {
        rowNumber: row.rowNumber,
        sourceId: normalized.source_id,
        fingerprint: fingerprint(dto.kind, normalized),
        rawData: row.data as Prisma.InputJsonValue,
        normalizedData: normalized,
      };
    });

    const repeatedRows = new Map<number, string>();
    const firstFingerprintRow = new Map<string, number>();
    for (const row of baseRows) {
      const firstRow = firstFingerprintRow.get(row.fingerprint);
      if (firstRow !== undefined) {
        const message = `Повтор строки ${firstRow} внутри этого файла; строка пропущена`;
        repeatedRows.set(row.rowNumber, message);
        issues.push({ rowNumber: row.rowNumber, level: 'warning', message });
      } else {
        firstFingerprintRow.set(row.fingerprint, row.rowNumber);
      }
    }

    const previouslyImported = await this.prisma.dataTransferRow.findMany({
      where: {
        fingerprint: { in: [...firstFingerprintRow.keys()] },
        status: DataTransferRowStatus.IMPORTED,
      },
      select: { fingerprint: true, batch: { select: { createdAt: true } } },
    });
    const previousByFingerprint = new Map(previouslyImported.map((row) => [row.fingerprint, row.batch.createdAt]));
    for (const row of baseRows) {
      const importedAt = previousByFingerprint.get(row.fingerprint);
      if (!importedAt) continue;
      const message = `Такая строка уже переносилась ${importedAt.toLocaleDateString('ru-RU')}; повтор пропущен`;
      repeatedRows.set(row.rowNumber, message);
      issues.push({ rowNumber: row.rowNumber, level: 'warning', message });
    }

    const staticErrorRows = new Set(issues.filter((issue) => issue.level === 'error').map((issue) => issue.rowNumber));
    const matchResult = await this.detectExistingMatches(
      dto.kind,
      baseRows.filter((row) => !repeatedRows.has(row.rowNumber) && !staticErrorRows.has(row.rowNumber)),
    );
    issues.push(...matchResult.issues);

    const issuesByRow = groupBy(issues, (issue) => issue.rowNumber);
    const preparedRows = baseRows.map((row) => {
      const rowIssues = issuesByRow.get(row.rowNumber) ?? [];
      const skipped = repeatedRows.has(row.rowNumber) || rowIssues.some((issue) => issue.level === 'error');
      return {
        ...row,
        status: skipped ? DataTransferRowStatus.SKIPPED : DataTransferRowStatus.READY,
        normalizedData: row.normalizedData as Prisma.InputJsonValue,
        error: skipped ? (repeatedRows.get(row.rowNumber) || rowIssues.filter((issue) => issue.level === 'error').map((issue) => issue.message).join('; ')) : null,
      };
    });
    const readyRows = preparedRows.filter((row) => row.status === DataTransferRowStatus.READY).length;
    const metadata = {
      issues,
      samples: preparedRows.slice(0, 20).map((row) => ({ row: row.rowNumber, ...(row.normalizedData as Record<string, string | null>) })),
      preview: {
        matchedRecords: matchResult.matchedRecords,
        matchedByType: matchResult.matchedByType,
        repeatedRows: repeatedRows.size,
        sourceEntitiesByType: countSourceEntitiesByType(dto.kind, baseRows.map((row) => row.normalizedData)),
      },
    };

    const batch = await this.prisma.$transaction(async (tx) => {
      const baseData = {
        sourceSystem: dto.sourceSystem.trim(),
        kind: dto.kind,
        originalFileName: dto.fileName?.trim() || null,
        fileChecksum: dto.fileChecksum.toLowerCase(),
        status: DataTransferStatus.PREVIEWED,
        totalRows: preparedRows.length,
        readyRows,
        importedRows: 0,
        skippedRows: preparedRows.length - readyRows,
        failedRows: 0,
        createdById: actor.id,
        completedAt: null,
        rolledBackAt: null,
        errorSummary: null,
        metadata: metadata as Prisma.InputJsonValue,
      };
      const current = existing
        ? await tx.dataTransferBatch.update({ where: { id: existing.id }, data: baseData })
        : await tx.dataTransferBatch.create({ data: baseData });
      await tx.dataTransferEntityLink.deleteMany({ where: { batchId: current.id } });
      await tx.dataTransferRow.deleteMany({ where: { batchId: current.id } });
      await tx.dataTransferFieldMapping.deleteMany({ where: { batchId: current.id } });
      await tx.dataTransferFieldMapping.createMany({
        data: mappings.map((mapping) => ({ batchId: current.id, ...mapping })),
      });
      for (const rows of chunks(preparedRows, 500)) {
        await tx.dataTransferRow.createMany({
          data: rows.map((row) => ({ batchId: current.id, ...row })),
        });
      }
      return tx.dataTransferBatch.findUniqueOrThrow({ where: { id: current.id }, include: { fieldMappings: true } });
    }, { maxWait: 10_000, timeout: 60_000 });

    return { ...this.presentBatch(batch), repeatProtected: false };
  }

  async commit(batchId: string, actor: AuthEmployee) {
    const batch = await this.prisma.dataTransferBatch.findUnique({
      where: { id: batchId },
      include: { rows: { orderBy: { rowNumber: 'asc' } }, fieldMappings: true },
    });
    if (!batch) {
      throw new NotFoundException('Партия переноса не найдена');
    }
    this.ensurePermission(batch.kind as DataTransferKind, actor);
    ensureImportFileAllowed(batch.originalFileName);
    if (batch.status === DataTransferStatus.COMPLETED || batch.status === DataTransferStatus.COMPLETED_WITH_ERRORS) {
      return { ...this.presentBatch(batch), repeatProtected: true };
    }
    if (!new Set<DataTransferStatus>([DataTransferStatus.PREVIEWED, DataTransferStatus.FAILED, DataTransferStatus.ROLLED_BACK]).has(batch.status)) {
      throw new BadRequestException('Эта партия сейчас недоступна для импорта');
    }

    const claim = await this.prisma.dataTransferBatch.updateMany({
      where: {
        id: batch.id,
        status: { in: [DataTransferStatus.PREVIEWED, DataTransferStatus.FAILED, DataTransferStatus.ROLLED_BACK] },
      },
      data: { status: DataTransferStatus.IMPORTING, startedAt: new Date(), errorSummary: null },
    });
    if (claim.count !== 1) {
      const current = await this.prisma.dataTransferBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { fieldMappings: true } });
      if (current.status === DataTransferStatus.COMPLETED || current.status === DataTransferStatus.COMPLETED_WITH_ERRORS) {
        return { ...this.presentBatch(current), repeatProtected: true };
      }
      throw new BadRequestException('Эта партия уже обрабатывается другим запросом');
    }

    const alreadyImported = batch.rows.filter((row) => row.status === DataTransferRowStatus.IMPORTED);
    let importedRows = alreadyImported.length;
    let failedRows = 0;
    let createdRecords = alreadyImported.reduce((sum, row) => sum + jsonNumber(row.result, 'created'), 0);
    let matchedRecords = alreadyImported.reduce((sum, row) => sum + jsonNumber(row.result, 'matched'), 0);
    const errors: TransferIssue[] = [];
    for (const row of batch.rows) {
      if (row.status === DataTransferRowStatus.SKIPPED || row.status === DataTransferRowStatus.IMPORTED) {
        continue;
      }
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const imported = await this.importRow(tx, batch.id, row.id, batch.kind as DataTransferKind, row.normalizedData as NormalizedRow);
          await tx.dataTransferRow.update({
            where: { id: row.id },
            data: { status: DataTransferRowStatus.IMPORTED, result: imported as Prisma.InputJsonValue, error: null },
          });
          return imported;
        });
        importedRows += 1;
        createdRecords += result.created;
        matchedRecords += result.matched;
      } catch (error) {
        failedRows += 1;
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка импорта';
        errors.push({ rowNumber: row.rowNumber, level: 'error', message });
        await this.prisma.dataTransferRow.update({
          where: { id: row.id },
          data: { status: DataTransferRowStatus.FAILED, error: message },
        });
      }
    }

    const completedAt = new Date();
    const updated = await this.prisma.dataTransferBatch.update({
      where: { id: batch.id },
      data: {
        status: failedRows ? DataTransferStatus.COMPLETED_WITH_ERRORS : DataTransferStatus.COMPLETED,
        importedRows,
        failedRows,
        completedAt,
        errorSummary: errors.length ? errors.map((error) => `Строка ${error.rowNumber}: ${error.message}`).join('\n') : null,
        metadata: {
          ...jsonObject(batch.metadata),
          commit: { createdRecords, matchedRecords, errors },
        },
      },
      include: { fieldMappings: true },
    });
    await this.auditService.log({
      actorId: actor.id,
      action: 'imports.transfer.commit',
      entityType: 'DataTransferBatch',
      entityId: batch.id,
      metadata: { kind: batch.kind, importedRows, failedRows, createdRecords, matchedRecords },
    });
    return { ...this.presentBatch(updated), repeatProtected: false };
  }

  async rollback(batchId: string, actor: AuthEmployee) {
    const batch = await this.prisma.dataTransferBatch.findUnique({
      where: { id: batchId },
      include: { entityLinks: true, fieldMappings: true },
    });
    if (!batch) {
      throw new NotFoundException('Партия переноса не найдена');
    }
    this.ensurePermission(batch.kind as DataTransferKind, actor);
    if (!new Set<DataTransferStatus>([DataTransferStatus.COMPLETED, DataTransferStatus.COMPLETED_WITH_ERRORS, DataTransferStatus.ROLLBACK_BLOCKED]).has(batch.status)) {
      throw new BadRequestException('Откат доступен только для завершённой партии');
    }

    const links = batch.entityLinks.filter((link) => link.action === DataTransferAction.CREATED && link.rollbackEligible && !link.rolledBackAt);
    const createdIds = groupCreatedIds(links);
    const claim = await this.prisma.dataTransferBatch.updateMany({
      where: {
        id: batch.id,
        status: { in: [DataTransferStatus.COMPLETED, DataTransferStatus.COMPLETED_WITH_ERRORS, DataTransferStatus.ROLLBACK_BLOCKED] },
      },
      data: { status: DataTransferStatus.ROLLING_BACK },
    });
    if (claim.count !== 1) {
      throw new BadRequestException('Эта партия уже отменяется другим запросом');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const link of links) {
          await this.assertRollbackSafe(tx, link.targetEntityType, link.targetEntityId, createdIds, batch.completedAt ?? batch.updatedAt);
        }
        for (const link of [...links].sort((left, right) => rollbackPriority(right.targetEntityType) - rollbackPriority(left.targetEntityType))) {
          await deleteImportedEntity(tx, link.targetEntityType, link.targetEntityId);
          await tx.dataTransferEntityLink.update({ where: { id: link.id }, data: { rolledBackAt: new Date() } });
        }
        await tx.dataTransferRow.updateMany({
          where: { batchId: batch.id, status: DataTransferRowStatus.IMPORTED },
          data: { status: DataTransferRowStatus.ROLLED_BACK },
        });
        await tx.dataTransferBatch.update({
          where: { id: batch.id },
          data: { status: DataTransferStatus.ROLLED_BACK, rolledBackAt: new Date(), errorSummary: null },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Откат остановлен проверкой безопасности';
      await this.prisma.dataTransferBatch.updateMany({
        where: { id: batch.id, status: DataTransferStatus.ROLLING_BACK },
        data: { status: DataTransferStatus.ROLLBACK_BLOCKED, errorSummary: message },
      });
      throw new BadRequestException(`Откат не выполнен: ${message}`);
    }

    await this.auditService.log({
      actorId: actor.id,
      action: 'imports.transfer.rollback',
      entityType: 'DataTransferBatch',
      entityId: batch.id,
      metadata: { removedRecords: links.length },
    });
    const updated = await this.prisma.dataTransferBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { fieldMappings: true } });
    return this.presentBatch(updated);
  }

  private validateMappings(dto: PreviewDataTransferDto) {
    const allowed = new Set(targetFields[dto.kind].map((field) => field.value));
    const seenSources = new Set<string>();
    const seenTargets = new Set<string>();
    const mappings = dto.mappings
      .map((mapping) => {
        const sourceColumn = mapping.sourceColumn.trim();
        const targetField = mapping.targetField.trim();
        return {
          sourceColumn,
          targetField,
          required: Boolean(targetFields[dto.kind].find((field) => field.value === targetField)?.required),
        };
      })
      .filter((mapping) => mapping.sourceColumn && mapping.targetField);
    for (const mapping of mappings) {
      if (seenSources.has(mapping.sourceColumn)) {
        throw new BadRequestException(`Колонка файла сопоставлена дважды: ${mapping.sourceColumn}`);
      }
      if (!allowed.has(mapping.targetField)) {
        throw new BadRequestException(`Неизвестное поле назначения: ${mapping.targetField}`);
      }
      if (seenTargets.has(mapping.targetField)) {
        throw new BadRequestException(`Одно поле нельзя сопоставить дважды: ${mapping.targetField}`);
      }
      seenSources.add(mapping.sourceColumn);
      seenTargets.add(mapping.targetField);
    }
    const requiredTargets = targetFields[dto.kind].filter((field) => field.required).map((field) => field.value);
    for (const required of requiredTargets) {
      if (!seenTargets.has(required)) {
        throw new BadRequestException(`Не сопоставлено обязательное поле: ${required}`);
      }
    }
    if (dto.kind === 'clients' && !seenTargets.has('owner_name') && !seenTargets.has('phone')) {
      throw new BadRequestException('Для клиентов сопоставьте ФИО владельца или телефон');
    }
    if (dto.kind === 'history' && !seenTargets.has('animal_name') && !seenTargets.has('microchip')) {
      throw new BadRequestException('Для истории сопоставьте кличку пациента или микрочип');
    }
    return mappings;
  }

  private ensurePermission(kind: DataTransferKind, actor: AuthEmployee) {
    const permissions = new Set(actor.permissions);
    if (permissions.has('*')) return;
    if ((kind === 'clients' || kind === 'history') && permissions.has('owners.manage') && permissions.has('animals.manage')) return;
    if ((kind === 'catalog' || kind === 'stock') && permissions.has('stock.manage')) return;
    throw new ForbiddenException('Недостаточно прав для выбранного раздела переноса');
  }

  private async detectExistingMatches(kind: DataTransferKind, rows: PreviewPreparedRow[]): Promise<PreviewMatchResult> {
    const issues: TransferIssue[] = [];
    const matchedByType: Record<string, number> = {};
    const ownerIdByRow = new Map<number, string>();
    const animalIdByRow = new Map<number, string>();
    const addMatch = (rowNumber: number, type: string, field: string, message: string) => {
      matchedByType[type] = (matchedByType[type] ?? 0) + 1;
      issues.push({ rowNumber, level: 'warning', field, message });
    };
    const addAmbiguous = (rowNumber: number, field: string, message: string) => {
      issues.push({ rowNumber, level: 'error', field, message });
    };

    if (kind === 'clients' || kind === 'history') {
      const phoneKeys = unique(rows.map((row) => safePhone(row.normalizedData.phone)).filter(isPresent));
      const ownerNames = unique(rows
        .filter((row) => !clean(row.normalizedData.phone))
        .map((row) => clean(row.normalizedData.owner_name))
        .filter(isPresent));
      const nameKeys = unique(ownerNames.map(normalizePersonNameKey));
      const ownerConditions: Prisma.OwnerWhereInput[] = [];
      if (phoneKeys.length) ownerConditions.push({ phoneNormalized: { in: phoneKeys } });
      if (phoneKeys.length) ownerConditions.push({ phone: { in: phoneKeys.map(formatNormalizedRussianPhone).filter(isPresent) } });
      if (nameKeys.length) ownerConditions.push({ fullNameNormalized: { in: nameKeys } });
      if (ownerNames.length) ownerConditions.push({ fullName: { in: ownerNames, mode: Prisma.QueryMode.insensitive } });
      const owners = ownerConditions.length
        ? await this.prisma.owner.findMany({
            where: { OR: ownerConditions },
            select: { id: true, phone: true, phoneNormalized: true, fullName: true, fullNameNormalized: true },
          })
        : [];
      const ownersByPhone = groupBy(
        owners.filter((owner) => owner.phoneNormalized || safePhone(owner.phone)),
        (owner) => owner.phoneNormalized || safePhone(owner.phone)!,
      );
      const ownersByName = groupBy(owners, (owner) => owner.fullNameNormalized || normalizePersonNameKey(owner.fullName));

      for (const row of rows) {
        const phone = safePhone(row.normalizedData.phone);
        const suppliedPhone = clean(row.normalizedData.phone);
        const ownerName = clean(row.normalizedData.owner_name);
        const candidates = phone
          ? ownersByPhone.get(phone) ?? []
          : !suppliedPhone && ownerName
            ? ownersByName.get(normalizePersonNameKey(ownerName)) ?? []
            : [];
        if (candidates.length > 1) {
          addAmbiguous(row.rowNumber, phone ? 'phone' : 'owner_name', 'Найдено несколько похожих владельцев. Уточните телефон или исправьте дубль перед переносом');
        } else if (candidates.length === 1) {
          ownerIdByRow.set(row.rowNumber, candidates[0].id);
          addMatch(row.rowNumber, 'owners', phone ? 'phone' : 'owner_name', 'Найден существующий владелец; его карточка не будет перезаписана');
        }
      }

      const ownerIds = unique([...ownerIdByRow.values()]);
      const microchips = unique(rows.map((row) => clean(row.normalizedData.microchip)).filter(isPresent));
      const animalNames = unique(rows.map((row) => clean(row.normalizedData.animal_name)).filter(isPresent));
      const animalConditions: Prisma.AnimalWhereInput[] = [];
      if (microchips.length) animalConditions.push({ microchip: { in: microchips } });
      if (ownerIds.length && animalNames.length) animalConditions.push({ ownerId: { in: ownerIds }, nickname: { in: animalNames, mode: Prisma.QueryMode.insensitive } });
      const animals = animalConditions.length
        ? await this.prisma.animal.findMany({
            where: { OR: animalConditions },
            select: { id: true, ownerId: true, nickname: true, microchip: true },
          })
        : [];
      const animalsByChip = groupBy(
        animals.filter((animal) => animal.microchip),
        (animal) => animal.microchip!,
      );
      const animalsByName = groupBy(animals, (animal) => compositeKey(animal.ownerId, normalize(animal.nickname)));
      for (const row of rows) {
        const ownerId = ownerIdByRow.get(row.rowNumber);
        if (!ownerId) continue;
        const microchip = clean(row.normalizedData.microchip);
        const animalName = clean(row.normalizedData.animal_name);
        const candidates = microchip
          ? animalsByChip.get(microchip) ?? []
          : animalName
            ? animalsByName.get(compositeKey(ownerId, normalize(animalName))) ?? []
            : [];
        if (candidates.length > 1) {
          addAmbiguous(row.rowNumber, microchip ? 'microchip' : 'animal_name', 'Найдено несколько похожих пациентов. Уточните микрочип или исправьте дубль перед переносом');
        } else if (microchip && candidates.length === 1 && candidates[0].ownerId !== ownerId) {
          addAmbiguous(row.rowNumber, 'microchip', 'Этот микрочип уже привязан к пациенту другого владельца. Автоматический перенос остановлен');
        } else if (candidates.length === 1) {
          animalIdByRow.set(row.rowNumber, candidates[0].id);
          addMatch(row.rowNumber, 'animals', microchip ? 'microchip' : 'animal_name', 'Найден существующий пациент; его карточка не будет перезаписана');
        }
      }

      const animalIds = unique([...animalIdByRow.values()]);
      if (kind === 'history' && animalIds.length) {
        const visitDates = unique(rows.map((row) => parseDateTime(row.normalizedData.visit_date)?.toISOString()).filter(isPresent));
        const visits = visitDates.length
          ? await this.prisma.visit.findMany({
              where: { animalId: { in: animalIds }, startedAt: { in: visitDates.map((value) => new Date(value)) } },
              select: { id: true, animalId: true, startedAt: true },
            })
          : [];
        const visitsByKey = groupBy(visits, (visit) => compositeKey(visit.animalId, visit.startedAt.toISOString()));
        for (const row of rows) {
          const animalId = animalIdByRow.get(row.rowNumber);
          const visitDate = parseDateTime(row.normalizedData.visit_date);
          if (!animalId || !visitDate) continue;
          const candidates = visitsByKey.get(compositeKey(animalId, visitDate.toISOString())) ?? [];
          if (candidates.length > 1) {
            addAmbiguous(row.rowNumber, 'visit_date', 'На эту дату найдено несколько приёмов пациента. Строка требует ручной проверки');
          } else if (candidates.length === 1) {
            addMatch(row.rowNumber, 'visits', 'visit_date', 'Такой приём уже есть; повторный приём создан не будет');
          }
        }
      }

      if (kind === 'clients' && animalIds.length) {
        const titles = unique(rows.map((row) => clean(row.normalizedData.vaccination_title)).filter(isPresent));
        const vaccinations = titles.length
          ? await this.prisma.vaccination.findMany({
              where: { animalId: { in: animalIds }, title: { in: titles, mode: Prisma.QueryMode.insensitive } },
              select: { id: true, animalId: true, title: true, vaccinatedAt: true },
            })
          : [];
        const vaccinationsByKey = groupBy(vaccinations, (vaccination) => compositeKey(
          vaccination.animalId,
          normalize(vaccination.title),
          vaccination.vaccinatedAt?.toISOString() ?? '',
        ));
        for (const row of rows) {
          const animalId = animalIdByRow.get(row.rowNumber);
          const title = clean(row.normalizedData.vaccination_title);
          if (!animalId || !title) continue;
          const vaccinatedAt = parseDate(row.normalizedData.vaccinated_at)?.toISOString() ?? '';
          const candidates = vaccinationsByKey.get(compositeKey(animalId, normalize(title), vaccinatedAt)) ?? [];
          if (candidates.length > 1) {
            addAmbiguous(row.rowNumber, 'vaccination_title', 'Найдено несколько одинаковых вакцинаций. Строка требует ручной проверки');
          } else if (candidates.length === 1) {
            addMatch(row.rowNumber, 'vaccinations', 'vaccination_title', 'Такая вакцинация уже есть; повторная запись создана не будет');
          }
        }
      }
    } else {
      const serviceRows = kind === 'catalog'
        ? rows.filter((row) => isServiceItemType(row.normalizedData.item_type))
        : [];
      const serviceRowNumbers = new Set(serviceRows.map((row) => row.rowNumber));
      const serviceRowsByTitle = groupBy(
        serviceRows.filter((row) => clean(row.normalizedData.title)),
        (row) => normalize(row.normalizedData.title),
      );
      for (const sameTitleRows of serviceRowsByTitle.values()) {
        if (sameTitleRows.length < 2) continue;
        const sourceRows = sameTitleRows.map((row) => row.rowNumber).join(', ');
        for (const row of sameTitleRows) {
          addAmbiguous(
            row.rowNumber,
            'title',
            `В файле несколько услуг с таким названием (строки ${sourceRows}). Добавьте к названию вид животного или раздел`,
          );
        }
      }
      const serviceTitles = unique(serviceRows.map((row) => clean(row.normalizedData.title)).filter(isPresent));
      const services = serviceTitles.length
        ? await this.prisma.service.findMany({
            where: { isActive: true, title: { in: serviceTitles, mode: Prisma.QueryMode.insensitive } },
            select: { id: true, title: true },
          })
        : [];
      const servicesByTitle = groupBy(services, (service) => normalize(service.title));
      for (const row of serviceRows) {
        const title = clean(row.normalizedData.title);
        if (!title) continue;
        const candidates = servicesByTitle.get(normalize(title)) ?? [];
        if (candidates.length > 1) {
          addAmbiguous(row.rowNumber, 'title', 'Найдено несколько услуг с таким названием. Исправьте дубль перед переносом');
        } else if (candidates.length === 1) {
          addMatch(row.rowNumber, 'services', 'title', 'Такая услуга уже есть; её карточка не будет перезаписана');
        }
      }

      const productRows = rows.filter((row) => !serviceRowNumbers.has(row.rowNumber));
      const barcodes = unique(productRows.map((row) => clean(row.normalizedData.barcode)).filter(isPresent));
      const skus = unique(productRows.filter((row) => !clean(row.normalizedData.barcode)).map((row) => clean(row.normalizedData.sku)).filter(isPresent));
      const productTitles = unique(productRows
        .filter((row) => !clean(row.normalizedData.barcode) && !clean(row.normalizedData.sku))
        .map((row) => clean(row.normalizedData.title))
        .filter(isPresent));
      const productConditions: Prisma.ProductWhereInput[] = [];
      if (barcodes.length) productConditions.push({
        OR: [
          { barcode: { in: barcodes } },
          { barcodes: { some: { value: { in: barcodes } } } },
        ],
      });
      if (skus.length) productConditions.push({ sku: { in: skus } });
      if (productTitles.length) productConditions.push({ title: { in: productTitles, mode: Prisma.QueryMode.insensitive } });
      const products = productConditions.length
        ? await this.prisma.product.findMany({
            where: { isActive: true, OR: productConditions },
            select: { id: true, title: true, sku: true, barcode: true, barcodes: { select: { value: true } } },
          })
        : [];
      const productsByBarcode = new Map<string, typeof products>();
      for (const product of products) {
        const values = unique([
          ...(product.barcode?.split(/[;,\r\n]+/) ?? []),
          ...product.barcodes.map((item) => item.value),
        ].map((value) => value.trim()).filter(Boolean));
        for (const value of values) {
          const matches = productsByBarcode.get(value) ?? [];
          if (!matches.some((item) => item.id === product.id)) matches.push(product);
          productsByBarcode.set(value, matches);
        }
      }
      const productsBySku = groupBy(products.filter((product) => product.sku), (product) => product.sku!);
      const productsByTitle = groupBy(products, (product) => normalize(product.title));
      const productIdByRow = new Map<number, string>();
      for (const row of productRows) {
        const barcode = clean(row.normalizedData.barcode);
        const sku = clean(row.normalizedData.sku);
        const title = clean(row.normalizedData.title);
        const candidates = barcode
          ? productsByBarcode.get(barcode) ?? []
          : sku
            ? productsBySku.get(sku) ?? []
            : title
              ? productsByTitle.get(normalize(title)) ?? []
              : [];
        if (candidates.length > 1) {
          addAmbiguous(row.rowNumber, barcode ? 'barcode' : sku ? 'sku' : 'title', 'Найдено несколько похожих товаров. Уточните штрихкод или артикул');
        } else if (candidates.length === 1) {
          productIdByRow.set(row.rowNumber, candidates[0].id);
          addMatch(row.rowNumber, 'products', barcode ? 'barcode' : sku ? 'sku' : 'title', 'Такой товар уже есть; его карточка не будет перезаписана');
        }
      }

      if (kind === 'stock' && productIdByRow.size) {
        const warehouseNames = unique(rows.map((row) => clean(row.normalizedData.warehouse)).filter(isPresent));
        const warehouses = warehouseNames.length
          ? await this.prisma.warehouse.findMany({
              where: { name: { in: warehouseNames, mode: Prisma.QueryMode.insensitive } },
              select: { id: true, name: true },
            })
          : [];
        const warehousesByName = groupBy(warehouses, (warehouse) => normalize(warehouse.name));
        const defaultWarehouse = await this.prisma.warehouse.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
        const warehouseIdByRow = new Map<number, string>();
        for (const row of rows) {
          if (!productIdByRow.has(row.rowNumber) || !parseDecimal(row.normalizedData.quantity, 0).greaterThan(0)) continue;
          const warehouseName = clean(row.normalizedData.warehouse);
          const candidates = warehouseName ? warehousesByName.get(normalize(warehouseName)) ?? [] : defaultWarehouse ? [defaultWarehouse] : [];
          if (candidates.length > 1) {
            addAmbiguous(row.rowNumber, 'warehouse', 'Найдено несколько складов с одинаковым названием; укажите уникальный склад');
          } else if (!candidates.length) {
            addAmbiguous(row.rowNumber, 'warehouse', 'Склад для переноса остатка не найден');
          } else {
            warehouseIdByRow.set(row.rowNumber, candidates[0].id);
          }
        }
        const productIds = unique([...productIdByRow.values()]);
        const warehouseIds = unique([...warehouseIdByRow.values()]);
        const movements = productIds.length && warehouseIds.length
          ? await this.prisma.stockMovement.findMany({
              where: { productId: { in: productIds }, warehouseId: { in: warehouseIds } },
              select: { id: true, productId: true, warehouseId: true },
            })
          : [];
        const activeLinks = movements.length
          ? await this.prisma.dataTransferEntityLink.findMany({
              where: {
                targetEntityType: 'StockMovement',
                targetEntityId: { in: movements.map((movement) => movement.id) },
                rolledBackAt: null,
                batch: { status: { not: DataTransferStatus.ROLLED_BACK } },
              },
              select: { targetEntityId: true },
            })
          : [];
        const activeMovementIds = new Set(activeLinks.map((link) => link.targetEntityId));
        const activeStockKeys = new Set(movements
          .filter((movement) => activeMovementIds.has(movement.id) && movement.warehouseId)
          .map((movement) => compositeKey(movement.productId, movement.warehouseId!)));
        for (const row of rows) {
          const productId = productIdByRow.get(row.rowNumber);
          const warehouseId = warehouseIdByRow.get(row.rowNumber);
          if (productId && warehouseId && activeStockKeys.has(compositeKey(productId, warehouseId))) {
            addAmbiguous(row.rowNumber, 'quantity', 'Остаток этого товара на выбранном складе уже переносился другой партией; сначала отмените прежнюю партию');
          }
        }
      }
    }

    return {
      issues,
      matchedRecords: Object.values(matchedByType).reduce((sum, count) => sum + count, 0),
      matchedByType,
    };
  }

  private presentBatch(batch: {
    id: string;
    sourceSystem: string;
    kind: string;
    originalFileName: string | null;
    fileChecksum: string;
    status: DataTransferStatus;
    totalRows: number;
    readyRows: number;
    importedRows: number;
    skippedRows: number;
    failedRows: number;
    startedAt: Date | null;
    completedAt: Date | null;
    rolledBackAt: Date | null;
    errorSummary: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    fieldMappings?: Array<{ sourceColumn: string; targetField: string }>;
  }) {
    return {
      ...batch,
      fileChecksum: batch.fileChecksum.slice(0, 12),
      mappings: batch.fieldMappings?.map(({ sourceColumn, targetField }) => ({ sourceColumn, targetField })) ?? [],
      fieldMappings: undefined,
      canCommit: new Set<DataTransferStatus>([DataTransferStatus.PREVIEWED, DataTransferStatus.FAILED, DataTransferStatus.ROLLED_BACK]).has(batch.status),
      canRollback: new Set<DataTransferStatus>([DataTransferStatus.COMPLETED, DataTransferStatus.COMPLETED_WITH_ERRORS, DataTransferStatus.ROLLBACK_BLOCKED]).has(batch.status),
    };
  }

  private async importRow(tx: Tx, batchId: string, rowId: string, kind: DataTransferKind, row: NormalizedRow) {
    if (kind === 'clients') return this.importClientRow(tx, batchId, rowId, row);
    if (kind === 'history') return this.importHistoryRow(tx, batchId, rowId, row);
    if (kind === 'catalog') return this.importCatalogRow(tx, batchId, rowId, row);
    return this.importStockRow(tx, batchId, rowId, row);
  }

  private async resolveOwner(tx: Tx, batchId: string, rowId: string, row: NormalizedRow) {
    const ownerSourceId = clean(row.owner_source_id);
    if (ownerSourceId) {
      const linkedOwnerIds = await this.findLinkedEntityIds(tx, batchId, 'Owner', ownerSourceId);
      if (linkedOwnerIds.length > 1) throw new Error('Один ID владельца связан с несколькими карточками; автоматический перенос остановлен');
      if (linkedOwnerIds.length === 1) {
        const linkedOwner = await tx.owner.findUnique({ where: { id: linkedOwnerIds[0] } });
        if (!linkedOwner) throw new Error('Связь с владельцем повреждена; автоматический перенос остановлен');
        return { owner: linkedOwner, created: 0, matched: 1 };
      }
    }
    const phoneNormalized = safePhone(row.phone);
    const suppliedPhone = clean(row.phone);
    const ownerName = clean(row.owner_name);
    // A supplied phone is the stronger identifier. Never merge a person with
    // another owner merely because their names match while phones differ.
    let ownerCandidates = phoneNormalized
      ? await tx.owner.findMany({
          where: { OR: [{ phoneNormalized }, { phone: formatNormalizedRussianPhone(phoneNormalized) }] },
          take: 2,
        })
      : !suppliedPhone && ownerName
        ? await tx.owner.findMany({
            where: {
              OR: [
                { fullNameNormalized: normalizePersonNameKey(ownerName) },
                { fullName: { equals: ownerName, mode: Prisma.QueryMode.insensitive } },
              ],
            },
            take: 2,
          })
        : [];
    if (ownerSourceId && ownerCandidates.length) {
      const conflictingIds = await this.findEntitiesLinkedToOtherSourceIds(
        tx,
        batchId,
        'Owner',
        ownerCandidates.map((owner) => owner.id),
        ownerSourceId,
      );
      ownerCandidates = ownerCandidates.filter((owner) => !conflictingIds.has(owner.id));
    }
    if (ownerCandidates.length > 1) throw new Error('Найдено несколько похожих владельцев; автоматическое объединение остановлено');
    const owner = ownerCandidates[0] ?? null;
    if (owner) {
      await this.link(tx, batchId, rowId, 'Owner', owner.id, DataTransferAction.MATCHED, ownerSourceId || row.source_id);
      return { owner, created: 0, matched: 1 };
    }
    const created = await tx.owner.create({
      data: {
        fullName: normalizeDisplayName(ownerName || formatNormalizedRussianPhone(phoneNormalized) || 'Владелец из переноса'),
        fullNameNormalized: normalizePersonNameKey(ownerName || formatNormalizedRussianPhone(phoneNormalized) || 'Владелец из переноса'),
        phone: formatNormalizedRussianPhone(phoneNormalized),
        phoneNormalized,
        extraPhone: clean(row.extra_phone),
        email: clean(row.email),
        address: clean(row.address),
        comment: clean(row.owner_comment),
        source: 'Перенос данных',
      },
    });
    await this.link(tx, batchId, rowId, 'Owner', created.id, DataTransferAction.CREATED, ownerSourceId || row.source_id, true);
    return { owner: created, created: 1, matched: 0 };
  }

  private async resolveAnimal(tx: Tx, batchId: string, rowId: string, ownerId: string, row: NormalizedRow) {
    const animalName = clean(row.animal_name);
    const microchip = clean(row.microchip);
    if (!animalName && !microchip) return { animal: null, created: 0, matched: 0 };
    const animalSourceId = clean(row.animal_source_id);
    if (animalSourceId) {
      const linkedAnimalIds = await this.findLinkedEntityIds(tx, batchId, 'Animal', animalSourceId);
      if (linkedAnimalIds.length > 1) throw new Error('Один ID пациента связан с несколькими карточками; автоматический перенос остановлен');
      if (linkedAnimalIds.length === 1) {
        const linkedAnimal = await tx.animal.findUnique({ where: { id: linkedAnimalIds[0] } });
        if (!linkedAnimal || linkedAnimal.ownerId !== ownerId) {
          throw new Error('Связь с пациентом повреждена или ведёт к другому владельцу; автоматический перенос остановлен');
        }
        return { animal: linkedAnimal, created: 0, matched: 1 };
      }
    }
    // A microchip is authoritative. A nickname is used only when no chip was
    // supplied, so two animals with the same nickname are not silently merged.
    let animalCandidates = microchip
      ? await tx.animal.findMany({ where: { microchip }, take: 2 })
      : animalName
        ? await tx.animal.findMany({ where: { ownerId, nickname: { equals: animalName, mode: Prisma.QueryMode.insensitive } }, take: 2 })
        : [];
    if (animalSourceId && animalCandidates.length) {
      const conflictingIds = await this.findEntitiesLinkedToOtherSourceIds(
        tx,
        batchId,
        'Animal',
        animalCandidates.map((animal) => animal.id),
        animalSourceId,
      );
      animalCandidates = animalCandidates.filter((animal) => !conflictingIds.has(animal.id));
    }
    if (animalCandidates.length > 1) throw new Error('Найдено несколько похожих пациентов; автоматическое объединение остановлено');
    const animal = animalCandidates[0] ?? null;
    if (microchip && animal && animal.ownerId !== ownerId) {
      throw new Error('Микрочип уже привязан к пациенту другого владельца; автоматическое объединение остановлено');
    }
    if (animal) {
      await this.link(tx, batchId, rowId, 'Animal', animal.id, DataTransferAction.MATCHED, animalSourceId || row.source_id);
      return { animal, created: 0, matched: 1 };
    }
    const created = await tx.animal.create({
      data: {
        ownerId,
        nickname: animalName || `Пациент ${microchip}`,
        species: clean(row.species),
        breed: clean(row.breed),
        sex: parseSex(row.sex),
        birthDate: parseDate(row.birth_date) ?? undefined,
        microchip,
        comment: clean(row.animal_comment),
        status: clean(row.animal_status) || 'Перенесён из другой системы',
      },
    });
    await this.link(tx, batchId, rowId, 'Animal', created.id, DataTransferAction.CREATED, animalSourceId || row.source_id, true);
    return { animal: created, created: 1, matched: 0 };
  }

  private async importClientRow(tx: Tx, batchId: string, rowId: string, row: NormalizedRow) {
    const ownerResult = await this.resolveOwner(tx, batchId, rowId, row);
    const animalResult = await this.resolveAnimal(tx, batchId, rowId, ownerResult.owner.id, row);
    let created = ownerResult.created + animalResult.created;
    let matched = ownerResult.matched + animalResult.matched;
    if (animalResult.animal && clean(row.vaccination_title)) {
      const vaccinatedAt = parseDate(row.vaccinated_at);
      const vaccinationCandidates = await tx.vaccination.findMany({
        where: { animalId: animalResult.animal.id, title: clean(row.vaccination_title)!, vaccinatedAt },
        take: 2,
      });
      if (vaccinationCandidates.length > 1) throw new Error('Найдено несколько одинаковых вакцинаций; автоматическое объединение остановлено');
      const existing = vaccinationCandidates[0] ?? null;
      if (existing) {
        await this.link(tx, batchId, rowId, 'Vaccination', existing.id, DataTransferAction.MATCHED, row.source_id);
        matched += 1;
      } else {
        const vaccination = await tx.vaccination.create({
          data: {
            animalId: animalResult.animal.id,
            title: clean(row.vaccination_title)!,
            vaccinatedAt: vaccinatedAt ?? undefined,
            expiresAt: parseDate(row.vaccination_due_at) ?? undefined,
            vaccineSeries: clean(row.vaccination_series),
            notes: 'Перенесено из другой системы',
          },
        });
        await this.link(tx, batchId, rowId, 'Vaccination', vaccination.id, DataTransferAction.CREATED, row.source_id, true);
        created += 1;
      }
    }
    return { created, matched };
  }

  private async importHistoryRow(tx: Tx, batchId: string, rowId: string, row: NormalizedRow) {
    const ownerResult = await this.resolveOwner(tx, batchId, rowId, row);
    const animalResult = await this.resolveAnimal(tx, batchId, rowId, ownerResult.owner.id, row);
    if (!animalResult.animal) throw new Error('Пациент не найден и не может быть создан');
    const visitDate = parseDateTime(row.visit_date);
    if (!visitDate) throw new Error('Некорректная дата приёма');
    const visitCandidates = await tx.visit.findMany({ where: { animalId: animalResult.animal.id, startedAt: visitDate }, take: 2 });
    if (visitCandidates.length > 1) throw new Error('Найдено несколько приёмов пациента на одну дату; автоматическое объединение остановлено');
    const existing = visitCandidates[0] ?? null;
    if (existing) {
      await this.link(tx, batchId, rowId, 'Visit', existing.id, DataTransferAction.MATCHED, row.source_id);
      return { created: ownerResult.created + animalResult.created, matched: ownerResult.matched + animalResult.matched + 1 };
    }
    const employee = clean(row.doctor)
      ? await tx.employee.findFirst({ where: { fullName: { equals: clean(row.doctor)!, mode: 'insensitive' } } })
      : null;
    const amount = parseDecimal(row.amount, 0);
    const visit = await tx.visit.create({
      data: {
        ownerId: ownerResult.owner.id,
        animalId: animalResult.animal.id,
        employeeId: employee?.id,
        visitType: parseVisitType(row.visit_type),
        status: VisitStatus.COMPLETED,
        startedAt: visitDate,
        completedAt: visitDate,
        totalAmount: amount,
        exam: hasAny(row, ['purpose', 'anamnesis', 'examination', 'symptoms', 'manipulations']) ? {
          create: {
            purpose: clean(row.purpose),
            anamnesis: clean(row.anamnesis),
            examination: clean(row.examination),
            symptoms: clean(row.symptoms),
            manipulations: clean(row.manipulations),
          },
        } : undefined,
        diagnoses: clean(row.diagnosis) ? { create: [{ title: clean(row.diagnosis)!, description: clean(row.diagnosis_description), status: 'Перенесён' }] } : undefined,
        recommendation: hasAny(row, ['treatment_plan', 'care_notes']) ? { create: { treatmentPlan: clean(row.treatment_plan), careNotes: clean(row.care_notes) } } : undefined,
        documents: clean(row.document_title) ? { create: [{ title: clean(row.document_title)!, body: clean(row.document_body) }] } : undefined,
      },
      include: { exam: true, diagnoses: true, recommendation: true, documents: true },
    });
    await this.link(tx, batchId, rowId, 'Visit', visit.id, DataTransferAction.CREATED, row.source_id, true);
    if (visit.exam) await this.link(tx, batchId, rowId, 'VisitExam', visit.exam.id, DataTransferAction.CREATED, row.source_id, true);
    for (const diagnosis of visit.diagnoses) await this.link(tx, batchId, rowId, 'VisitDiagnosis', diagnosis.id, DataTransferAction.CREATED, row.source_id, true);
    if (visit.recommendation) await this.link(tx, batchId, rowId, 'VisitRecommendation', visit.recommendation.id, DataTransferAction.CREATED, row.source_id, true);
    for (const document of visit.documents) await this.link(tx, batchId, rowId, 'VisitDocument', document.id, DataTransferAction.CREATED, row.source_id, true);
    let created = ownerResult.created + animalResult.created + 1;
    if (amount.greaterThan(0)) {
      const bill = await tx.bill.create({
        data: {
          ownerId: ownerResult.owner.id,
          animalId: animalResult.animal.id,
          visitId: visit.id,
          source: BillSource.VISIT,
          totalAmount: amount,
          paidAmount: parseBillStatus(row.bill_status) === PaymentStatus.PAID ? amount : 0,
          status: parseBillStatus(row.bill_status),
        },
      });
      await this.link(tx, batchId, rowId, 'Bill', bill.id, DataTransferAction.CREATED, row.source_id, true);
      created += 1;
    }
    return { created, matched: ownerResult.matched + animalResult.matched };
  }

  private async importCatalogRow(tx: Tx, batchId: string, rowId: string, row: NormalizedRow) {
    const isService = isServiceItemType(row.item_type);
    if (isService) {
      const serviceCandidates = await tx.service.findMany({ where: { isActive: true, title: { equals: clean(row.title)!, mode: 'insensitive' } }, take: 2 });
      if (serviceCandidates.length > 1) throw new Error('Найдено несколько услуг с одинаковым названием; автоматическое объединение остановлено');
      const existing = serviceCandidates[0] ?? null;
      if (existing) {
        await this.link(tx, batchId, rowId, 'Service', existing.id, DataTransferAction.MATCHED, row.source_id);
        return { created: 0, matched: 1 };
      }
      const categoryResult = await this.resolveServiceCategory(tx, batchId, rowId, row);
      const priceType = parseServicePriceType(row);
      const priceRange = priceType === 'FLOATING' ? catalogServicePriceRange(row) : null;
      const service = await tx.service.create({
        data: {
          title: clean(row.title)!,
          categoryId: categoryResult.categoryId,
          price: priceRange?.minimum ?? catalogPrice(row),
          priceType,
          minimumPrice: priceRange?.minimum,
          maximumPrice: priceRange?.maximum,
          description: catalogDescription(row),
        },
      });
      await this.link(tx, batchId, rowId, 'Service', service.id, DataTransferAction.CREATED, row.source_id, true);
      return { created: 1 + categoryResult.created, matched: 0 };
    }
    return this.resolveProduct(tx, batchId, rowId, row);
  }

  private async resolveProduct(tx: Tx, batchId: string, rowId: string, row: NormalizedRow) {
    const barcode = clean(row.barcode);
    const sku = clean(row.sku);
    // Prefer stable identifiers. A title match is used only when the source
    // has neither barcode nor article, avoiding accidental stock merging.
    const productCandidates = barcode
      ? await tx.product.findMany({ where: { isActive: true, OR: [{ barcode }, { barcodes: { some: { value: barcode } } }] }, take: 2 })
      : sku
        ? await tx.product.findMany({ where: { isActive: true, sku }, take: 2 })
        : await tx.product.findMany({ where: { isActive: true, title: { equals: clean(row.title)!, mode: Prisma.QueryMode.insensitive } }, take: 2 });
    if (productCandidates.length > 1) throw new Error('Найдено несколько похожих товаров; автоматическое объединение остановлено');
    const existing = productCandidates[0] ?? null;
    if (existing) {
      await this.link(tx, batchId, rowId, 'Product', existing.id, DataTransferAction.MATCHED, row.source_id);
      return { product: existing, created: 0, matched: 1 };
    }
    const categoryResult = await this.resolveProductCategory(tx, batchId, rowId, row);
    const product = await tx.product.create({
      data: {
        title: clean(row.title)!,
        categoryId: categoryResult.categoryId,
        sku: clean(row.sku),
        barcode: clean(row.barcode),
        retailPrice: catalogPrice(row),
        stockUnit: clean(row.unit) || 'шт',
        writeOffUnit: clean(row.unit) || 'шт',
        minStock: parseOptionalDecimal(row.min_stock),
        description: catalogDescription(row),
        ...(barcode && /^\d{4,32}$/.test(barcode)
          ? { barcodes: { create: { value: barcode, isPrimary: true, type: /^\d{13}$/.test(barcode) ? 'EAN13' : 'OTHER' } } }
          : {}),
      },
    });
    await this.link(tx, batchId, rowId, 'Product', product.id, DataTransferAction.CREATED, row.source_id, true);
    return { product, created: 1 + categoryResult.created, matched: 0 };
  }

  private async resolveProductCategory(tx: Tx, batchId: string, rowId: string, row: NormalizedRow) {
    const title = clean(row.category);
    if (!title) return { categoryId: undefined, created: 0 };
    const existing = await tx.productCategory.findUnique({ where: { title } });
    if (existing) return { categoryId: existing.id, created: 0 };
    try {
      const category = await tx.productCategory.create({ data: { title } });
      await this.link(tx, batchId, rowId, 'ProductCategory', category.id, DataTransferAction.CREATED, row.source_id, true);
      return { categoryId: category.id, created: 1 };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const category = await tx.productCategory.findUniqueOrThrow({ where: { title } });
      return { categoryId: category.id, created: 0 };
    }
  }

  private async resolveServiceCategory(tx: Tx, batchId: string, rowId: string, row: NormalizedRow) {
    const title = clean(row.category);
    if (!title) return { categoryId: undefined, created: 0 };
    const existing = await tx.serviceCategory.findUnique({ where: { title } });
    if (existing) return { categoryId: existing.id, created: 0 };
    try {
      const category = await tx.serviceCategory.create({ data: { title } });
      await this.link(tx, batchId, rowId, 'ServiceCategory', category.id, DataTransferAction.CREATED, row.source_id, true);
      return { categoryId: category.id, created: 1 };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const category = await tx.serviceCategory.findUniqueOrThrow({ where: { title } });
      return { categoryId: category.id, created: 0 };
    }
  }

  private async importStockRow(tx: Tx, batchId: string, rowId: string, row: NormalizedRow) {
    const productResult = await this.resolveProduct(tx, batchId, rowId, row);
    const quantity = parseDecimal(row.quantity, 0);
    if (!quantity.greaterThan(0)) return { created: productResult.created, matched: productResult.matched };
    const warehouse = clean(row.warehouse)
      ? await this.resolveWarehouse(tx, clean(row.warehouse)!)
      : await tx.warehouse.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!warehouse) throw new Error('Не найден склад для переноса остатка');
    const previousMovements = await tx.stockMovement.findMany({
      where: { productId: productResult.product.id, warehouseId: warehouse.id },
      select: { id: true },
    });
    if (previousMovements.length) {
      const previousTransfer = await tx.dataTransferEntityLink.findFirst({
        where: {
          batchId: { not: batchId },
          targetEntityType: 'StockMovement',
          targetEntityId: { in: previousMovements.map((movement) => movement.id) },
          rolledBackAt: null,
          batch: { status: { not: DataTransferStatus.ROLLED_BACK } },
        },
        select: { id: true },
      });
      if (previousTransfer) {
        throw new Error('Остаток этого товара на выбранном складе уже переносился другой партией; сначала отмените прежнюю партию');
      }
    }
    const batch = await tx.stockBatch.create({
      data: {
        productId: productResult.product.id,
        warehouseId: warehouse.id,
        quantity,
        rest: quantity,
        purchasePrice: parseDecimal(row.purchase_price, 0),
        expiresAt: parseDate(row.expires_at) ?? undefined,
        series: clean(row.series),
      },
    });
    await this.link(tx, batchId, rowId, 'StockBatch', batch.id, DataTransferAction.CREATED, row.source_id, true);
    const movement = await tx.stockMovement.create({
      data: {
        productId: productResult.product.id,
        stockBatchId: batch.id,
        warehouseId: warehouse.id,
        type: StockMovementType.SUPPLY,
        quantity,
        unitCost: batch.purchasePrice,
        comment: 'Перенос данных',
      },
    });
    await this.link(tx, batchId, rowId, 'StockMovement', movement.id, DataTransferAction.CREATED, row.source_id, true);
    return { created: productResult.created + 2, matched: productResult.matched };
  }

  private async resolveWarehouse(tx: Tx, name: string) {
    const candidates = await tx.warehouse.findMany({ where: { name: { equals: name, mode: Prisma.QueryMode.insensitive } }, take: 2 });
    if (candidates.length > 1) throw new Error('Найдено несколько складов с одинаковым названием; укажите уникальный склад');
    return candidates[0] ?? null;
  }

  private link(
    tx: Tx,
    batchId: string,
    rowId: string,
    targetEntityType: string,
    targetEntityId: string,
    action: DataTransferAction,
    sourceEntityId: string | null,
    rollbackEligible = false,
  ) {
    return tx.dataTransferEntityLink.create({
      data: {
        batchId,
        rowId,
        sourceEntityType: targetEntityType,
        sourceEntityId,
        targetEntityType,
        targetEntityId,
        action,
        rollbackEligible,
      },
    });
  }

  private async findLinkedEntityIds(
    tx: Tx,
    batchId: string,
    targetEntityType: string,
    sourceEntityId: string,
  ) {
    const links = await tx.dataTransferEntityLink.findMany({
      where: { batchId, targetEntityType, sourceEntityId, rolledBackAt: null },
      select: { targetEntityId: true },
      take: 2,
    });
    return unique(links.map((link) => link.targetEntityId));
  }

  private async findEntitiesLinkedToOtherSourceIds(
    tx: Tx,
    batchId: string,
    targetEntityType: string,
    targetEntityIds: string[],
    sourceEntityId: string,
  ) {
    if (!targetEntityIds.length) return new Set<string>();
    const links = await tx.dataTransferEntityLink.findMany({
      where: {
        batchId,
        targetEntityType,
        targetEntityId: { in: targetEntityIds },
        sourceEntityId: { not: sourceEntityId },
        rolledBackAt: null,
      },
      select: { targetEntityId: true },
    });
    return new Set(links.map((link) => link.targetEntityId));
  }

  private async assertRollbackSafe(tx: Tx, type: string, id: string, created: Map<string, Set<string>>, completedAt: Date) {
    if (type === 'Owner') {
      const owner = await tx.owner.findUnique({
        where: { id },
        select: {
          updatedAt: true,
          portalAccess: { select: { id: true } },
          animals: { where: { id: { notIn: [...(created.get('Animal') ?? [])] } }, take: 1, select: { id: true } },
          visits: { where: { id: { notIn: [...(created.get('Visit') ?? [])] } }, take: 1, select: { id: true } },
          bills: { where: { id: { notIn: [...(created.get('Bill') ?? [])] } }, take: 1, select: { id: true } },
          appointments: { take: 1, select: { id: true } },
          queueEntries: { take: 1, select: { id: true } },
          trustedPeople: { take: 1, select: { id: true } },
          notifications: { take: 1, select: { id: true } },
          balanceOperations: { take: 1, select: { id: true } },
          tasks: { take: 1, select: { id: true } },
          sales: { take: 1, select: { id: true } },
          onlineRequests: { take: 1, select: { id: true } },
        },
      });
      if (owner && (owner.updatedAt > completedAt || owner.portalAccess || owner.animals.length || owner.visits.length || owner.bills.length || owner.appointments.length || owner.queueEntries.length || owner.trustedPeople.length || owner.notifications.length || owner.balanceOperations.length || owner.tasks.length || owner.sales.length || owner.onlineRequests.length)) {
        throw new Error('У созданного владельца уже появились новые связанные данные; владелец сохранён');
      }
    }
    if (type === 'Animal') {
      const animal = await tx.animal.findUnique({
        where: { id },
        select: {
          updatedAt: true,
          visits: { where: { id: { notIn: [...(created.get('Visit') ?? [])] } }, take: 1, select: { id: true } },
          vaccinations: { where: { id: { notIn: [...(created.get('Vaccination') ?? [])] } }, take: 1, select: { id: true } },
          appointments: { take: 1, select: { id: true } },
          queueEntries: { take: 1, select: { id: true } },
          bills: { where: { id: { notIn: [...(created.get('Bill') ?? [])] } }, take: 1, select: { id: true } },
          tasks: { take: 1, select: { id: true } },
          weights: { take: 1, select: { id: true } },
          sales: { take: 1, select: { id: true } },
          notifications: { take: 1, select: { id: true } },
          onlineRequests: { take: 1, select: { id: true } },
        },
      });
      if (animal && (animal.updatedAt > completedAt || animal.visits.length || animal.vaccinations.length || animal.appointments.length || animal.queueEntries.length || animal.bills.length || animal.tasks.length || animal.weights.length || animal.sales.length || animal.notifications.length || animal.onlineRequests.length)) {
        throw new Error('У созданного пациента уже появились новые связанные данные; пациент сохранён');
      }
    }
    if (type === 'Product') {
      const product = await tx.product.findUnique({
        where: { id },
        select: {
          updatedAt: true,
          batches: { where: { id: { notIn: [...(created.get('StockBatch') ?? [])] } }, take: 1, select: { id: true } },
          stockMovements: { where: { id: { notIn: [...(created.get('StockMovement') ?? [])] } }, take: 1, select: { id: true } },
          billItems: { take: 1, select: { id: true } },
          saleItems: { take: 1, select: { id: true } },
          supplyItems: { take: 1, select: { id: true } },
        },
      });
      if (product && (product.updatedAt > completedAt || product.batches.length || product.stockMovements.length || product.billItems.length || product.saleItems.length || product.supplyItems.length)) {
        throw new Error('Созданный товар уже используется после переноса; товар сохранён');
      }
    }
    if (type === 'Bill') {
      const bill = await tx.bill.findUnique({ where: { id }, select: { updatedAt: true, saleId: true, items: { take: 1 }, payments: { take: 1 } } });
      if (bill && (bill.updatedAt > completedAt || bill.saleId || bill.items.length || bill.payments.length)) throw new Error('По перенесённому счёту уже есть операции; счёт сохранён');
    }
    if (type === 'Vaccination') {
      const vaccination = await tx.vaccination.findUnique({ where: { id }, select: { updatedAt: true, revaccinationTask: { select: { id: true } } } });
      if (vaccination && (vaccination.updatedAt > completedAt || vaccination.revaccinationTask)) throw new Error('По вакцинации уже создано напоминание или она изменена; вакцинация сохранена');
    }
    if (type === 'StockBatch') {
      const stockBatch = await tx.stockBatch.findUnique({
        where: { id },
        select: { updatedAt: true, rest: true, quantity: true, movements: { where: { id: { notIn: [...(created.get('StockMovement') ?? [])] } }, take: 1 } },
      });
      if (stockBatch && (stockBatch.updatedAt > completedAt || !stockBatch.rest.equals(stockBatch.quantity) || stockBatch.movements.length)) {
        throw new Error('Остаток перенесённой партии уже изменился; партия сохранена');
      }
    }
    if (type === 'StockMovement') {
      const movement = await tx.stockMovement.findUnique({
        where: { id },
        select: { billItemId: true, visitId: true, saleId: true },
      });
      if (movement && (movement.billItemId || movement.visitId || movement.saleId)) {
        throw new Error('Складское движение уже связано с клинической или финансовой операцией; движение сохранено');
      }
    }
    if (type === 'Visit') {
      const visit = await tx.visit.findUnique({
        where: { id },
        select: {
          updatedAt: true,
          appointmentId: true,
          queueEntryId: true,
          hospitalBoxId: true,
          exam: { select: { id: true } },
          diagnoses: { where: { id: { notIn: [...(created.get('VisitDiagnosis') ?? [])] } }, take: 1, select: { id: true } },
          recommendation: { select: { id: true } },
          documents: { where: { id: { notIn: [...(created.get('VisitDocument') ?? [])] } }, take: 1, select: { id: true } },
          files: { take: 1, select: { id: true } },
          laboratoryOrders: { take: 1, select: { id: true } },
          stockMovements: { take: 1, select: { id: true } },
          bill: { select: { id: true } },
        },
      });
      const externalExam = visit?.exam && !(created.get('VisitExam') ?? new Set()).has(visit.exam.id);
      const externalRecommendation = visit?.recommendation && !(created.get('VisitRecommendation') ?? new Set()).has(visit.recommendation.id);
      const externalBill = visit?.bill && !(created.get('Bill') ?? new Set()).has(visit.bill.id);
      if (visit && (visit.updatedAt > completedAt || visit.appointmentId || visit.queueEntryId || visit.hospitalBoxId || externalExam || externalRecommendation || externalBill || visit.diagnoses.length || visit.documents.length || visit.files.length || visit.laboratoryOrders.length || visit.stockMovements.length)) {
        throw new Error('Перенесённый приём уже изменён или дополнен; приём сохранён');
      }
    }
    if (type === 'VisitExam') {
      const entity = await tx.visitExam.findUnique({ where: { id }, select: { updatedAt: true } });
      if (entity && entity.updatedAt > completedAt) throw new Error('Лист осмотра был изменён после переноса; запись сохранена');
    }
    if (type === 'VisitDiagnosis') {
      const entity = await tx.visitDiagnosis.findUnique({ where: { id }, select: { updatedAt: true } });
      if (entity && entity.updatedAt > completedAt) throw new Error('Диагноз был изменён после переноса; запись сохранена');
    }
    if (type === 'VisitRecommendation') {
      const entity = await tx.visitRecommendation.findUnique({ where: { id }, select: { updatedAt: true } });
      if (entity && entity.updatedAt > completedAt) throw new Error('Рекомендации были изменены после переноса; запись сохранена');
    }
    if (type === 'VisitDocument') {
      const entity = await tx.visitDocument.findUnique({ where: { id }, select: { updatedAt: true, generatedDocument: { select: { id: true } } } });
      if (entity && (entity.updatedAt > completedAt || entity.generatedDocument)) throw new Error('Документ был изменён или сформирован после переноса; запись сохранена');
    }
    if (type === 'Service') {
      const service = await tx.service.findUnique({
        where: { id },
        select: { updatedAt: true, billItems: { take: 1 }, saleItems: { take: 1 }, laboratoryTests: { take: 1 }, laboratoryProfiles: { take: 1 } },
      });
      if (service && (service.updatedAt > completedAt || service.billItems.length || service.saleItems.length || service.laboratoryTests.length || service.laboratoryProfiles.length)) {
        throw new Error('Созданная услуга уже используется после переноса; услуга сохранена');
      }
    }
    if (type === 'ProductCategory') {
      const category = await tx.productCategory.findUnique({
        where: { id },
        select: { updatedAt: true, products: { where: { id: { notIn: [...(created.get('Product') ?? [])] } }, take: 1, select: { id: true } } },
      });
      if (category && (category.updatedAt > completedAt || category.products.length)) {
        throw new Error('Созданная категория товаров уже используется; категория сохранена');
      }
    }
    if (type === 'ServiceCategory') {
      const category = await tx.serviceCategory.findUnique({
        where: { id },
        select: { updatedAt: true, services: { where: { id: { notIn: [...(created.get('Service') ?? [])] } }, take: 1, select: { id: true } } },
      });
      if (category && (category.updatedAt > completedAt || category.services.length)) {
        throw new Error('Созданная категория услуг уже используется; категория сохранена');
      }
    }
  }
}

function applyMappings(data: Record<string, string>, mappings: Array<{ sourceColumn: string; targetField: string }>) {
  return Object.fromEntries(mappings.map((mapping) => {
    const rawValue: unknown = data[mapping.sourceColumn];
    const value = typeof rawValue === 'string' ? rawValue : rawValue === null || rawValue === undefined ? null : String(rawValue);
    return [mapping.targetField, clean(value)];
  })) as NormalizedRow;
}

function validateRow(kind: DataTransferKind, rowNumber: number, row: NormalizedRow): TransferIssue[] {
  const issues: TransferIssue[] = [];
  const error = (field: string, message: string) => issues.push({ rowNumber, level: 'error', field, message });
  const warning = (field: string, message: string) => issues.push({ rowNumber, level: 'warning', field, message });
  if ((kind === 'clients' || kind === 'history') && !clean(row.owner_name) && !clean(row.phone)) error('owner_name', 'Нет ФИО владельца или телефона');
  if (kind === 'history' && !clean(row.animal_name) && !clean(row.microchip)) error('animal_name', 'Нет клички пациента или микрочипа');
  if (kind === 'history' && !parseDateTime(row.visit_date)) error('visit_date', 'Некорректная дата приёма');
  if ((kind === 'catalog' || kind === 'stock') && !clean(row.title)) error('title', 'Нет наименования');
  if (kind === 'catalog') {
    if (!clean(row.item_type)) warning('item_type', 'Тип позиции не указан: по умолчанию будет создан товар');
    if (!clean(row.price) && clean(row.minimum_price)) warning('price', 'Основная цена пуста: будет использована минимальная цена');
    if (isReviewRequired(row.review_status) || (!clean(row.price) && clean(row.price_note))) {
      warning('price', 'Цена требует подтверждения; для услуги будет создана плавающая цена, которую сотрудник укажет в счёте');
    }
    if (!isServiceItemType(row.item_type) && looksLikeServiceTitle(row.title)) {
      warning('item_type', 'Наименование похоже на услугу, но в файле указано как товар. Проверьте тип позиции');
    }
  }
  if (kind === 'stock' && !clean(row.quantity)) {
    error('quantity', 'Не указан остаток');
  } else if (kind === 'stock' && !parseOptionalDecimal(row.quantity)) {
    error('quantity', 'Некорректное числовое значение остатка');
  } else if (kind === 'stock' && parseDecimal(row.quantity, 0).lessThan(0)) {
    error('quantity', 'Остаток не может быть отрицательным');
  }
  for (const [field, label] of numericFields[kind]) {
    if (clean(row[field]) && !parseOptionalDecimal(row[field])) error(field, `Некорректное числовое значение: ${label}`);
  }
  for (const [field, label] of dateFields[kind]) {
    if (clean(row[field]) && !parseDateTime(row[field])) error(field, `Некорректная дата: ${label}`);
  }
  if (clean(row.phone) && !safePhone(row.phone)) warning('phone', 'Телефон не распознан и не будет использован для поиска дублей');
  if ((kind === 'clients' || kind === 'history') && !clean(row.phone) && clean(row.owner_name)) warning('owner_name', 'Телефон не указан: совпадение владельца будет проверяться только по ФИО');
  if ((kind === 'clients' || kind === 'history') && clean(row.animal_name) && !clean(row.microchip)) warning('animal_name', 'Микрочип не указан: совпадение пациента будет проверяться по владельцу и кличке');
  return issues;
}

const numericFields: Record<DataTransferKind, Array<[string, string]>> = {
  clients: [],
  history: [['amount', 'сумма счёта']],
  catalog: [['price', 'цена'], ['minimum_price', 'минимальная цена'], ['min_stock', 'минимальный остаток']],
  stock: [['price', 'цена продажи'], ['purchase_price', 'закупочная цена'], ['min_stock', 'минимальный остаток']],
};

const dateFields: Record<DataTransferKind, Array<[string, string]>> = {
  clients: [['birth_date', 'дата рождения'], ['vaccinated_at', 'дата вакцинации'], ['vaccination_due_at', 'следующая вакцинация']],
  history: [],
  catalog: [],
  stock: [['expires_at', 'срок годности']],
};

function fingerprint(kind: DataTransferKind, row: NormalizedRow) {
  return createHash('sha256').update(JSON.stringify([kind, ...Object.entries(row).sort(([a], [b]) => a.localeCompare(b))])).digest('hex');
}

function safePhone(value?: string | null) {
  const candidate = clean(value);
  if (!candidate) return null;
  try {
    return normalizePhoneForLookup(candidate);
  } catch {
    return null;
  }
}

function clean(value?: string | null) {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalize(value?: string | null) {
  return (clean(value) || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function isServiceItemType(value?: string | null) {
  const normalized = normalize(value);
  return normalized.includes('услуг') || normalized.includes('работ') || normalized === 'service' || normalized === 'work';
}

function isReviewRequired(value?: string | null) {
  return ['да', 'yes', 'true', '1', 'проверить', 'требует проверки'].includes(normalize(value));
}

function parseServicePriceType(row: NormalizedRow) {
  const explicit = normalize(row.price_type);
  if (explicit.includes('плава') || explicit.includes('динамич') || explicit.includes('договор') || explicit === 'floating') return 'FLOATING';
  if (explicit.includes('фикс') || explicit === 'fixed') return 'FIXED';
  if (isReviewRequired(row.review_status) || (!clean(row.price) && clean(row.price_note))) return 'FLOATING';
  return 'FIXED';
}

function catalogPrice(row: NormalizedRow) {
  return parseDecimal(row.price || row.minimum_price, 0);
}

function catalogServicePriceRange(row: NormalizedRow) {
  const minimum = parseOptionalDecimal(row.minimum_price);
  const regular = parseOptionalDecimal(row.price);
  if (minimum && regular) {
    return regular.greaterThanOrEqualTo(minimum)
      ? { minimum, maximum: regular }
      : { minimum: regular, maximum: minimum };
  }

  const note = clean(row.price_note);
  const match = note?.match(/(?:от\s*)?([\d\s.,]+)\s*(?:–|—|−|-|до)\s*([\d\s.,]+)/iu);
  if (match) {
    const first = parsePriceToken(match[1]);
    const second = parsePriceToken(match[2]);
    if (first && second) {
      return first.lessThanOrEqualTo(second)
        ? { minimum: first, maximum: second }
        : { minimum: second, maximum: first };
    }
  }

  const single = minimum ?? regular;
  return single ? { minimum: single, maximum: single } : null;
}

function parsePriceToken(value: string) {
  let normalized = value.trim().replace(/\s/g, '');
  if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  } else if (/^\d{1,3}(?:,\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/,/g, '');
  } else {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? new Prisma.Decimal(parsed) : null;
}

function catalogDescription(row: NormalizedRow) {
  const description = clean(row.description);
  const priceNote = clean(row.price_note);
  if (!priceNote || description?.toLocaleLowerCase('ru-RU').includes(priceNote.toLocaleLowerCase('ru-RU'))) return description;
  return [description, `Цена в исходном файле: ${priceNote}`].filter(isPresent).join('. ');
}

function looksLikeServiceTitle(value?: string | null) {
  const title = normalize(value);
  return /^(стационар|вакцинация|груминг|обработка)$/u.test(title)
    || /(анализ крови|лабораторн.*исследован|консультац|прием врача|приём врача)/u.test(title);
}

function parseSex(value?: string | null): AnimalSex {
  const normalized = normalize(value);
  if (['м', 'самец', 'male', 'кобель', 'кот'].includes(normalized)) return AnimalSex.MALE;
  if (['ж', 'самка', 'female', 'сука', 'кошка'].includes(normalized)) return AnimalSex.FEMALE;
  return AnimalSex.UNKNOWN;
}

function parseVisitType(value?: string | null): VisitType | undefined {
  const normalized = normalize(value);
  if (normalized.includes('повтор')) return VisitType.FOLLOW_UP;
  if (normalized.includes('первич')) return VisitType.PRIMARY;
  return undefined;
}

function parseBillStatus(value?: string | null): PaymentStatus {
  const normalized = normalize(value);
  if (normalized.includes('оплачен') || normalized === 'paid') return PaymentStatus.PAID;
  if (normalized.includes('частич')) return PaymentStatus.PARTIAL;
  if (normalized.includes('отмен')) return PaymentStatus.CANCELLED;
  return PaymentStatus.UNPAID;
}

function parseDate(value?: string | null) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const russian = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (russian) return createCalendarDate(Number(russian[3]), Number(russian[2]), Number(russian[1]));
  const iso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return createCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function parseDateTime(value?: string | null) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const russian = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (russian) {
    const day = Number(russian[1]);
    const month = Number(russian[2]);
    const year = Number(russian[3]);
    const hour = Number(russian[4] || 0);
    const minute = Number(russian[5] || 0);
    const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (Number.isNaN(calendar.getTime()) || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute) return null;
    return russian[4] ? new Date(calendar.getTime() - clinicUtcOffsetMinutes() * 60_000) : calendar;
  }
  const localIso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (localIso) {
    const year = Number(localIso[1]);
    const month = Number(localIso[2]);
    const day = Number(localIso[3]);
    const hour = Number(localIso[4] || 0);
    const minute = Number(localIso[5] || 0);
    const second = Number(localIso[6] || 0);
    const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) return null;
    return localIso[4] ? new Date(calendar.getTime() - clinicUtcOffsetMinutes() * 60_000) : calendar;
  }
  const isoDate = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/);
  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime())) return null;
  if (isoDate && (date.getUTCFullYear() !== Number(isoDate[1]) || date.getUTCMonth() !== Number(isoDate[2]) - 1 || date.getUTCDate() !== Number(isoDate[3]))) return null;
  return date;
}

function createCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function clinicUtcOffsetMinutes() {
  const parsed = Number(process.env.CLINIC_UTC_OFFSET_MINUTES ?? 180);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 14 * 60 ? parsed : 180;
}

function parseDecimal(value: string | null | undefined, fallback: number) {
  return parseOptionalDecimal(value) ?? new Prisma.Decimal(fallback);
}

export function parseOptionalDecimal(value?: string | null) {
  const normalized = clean(value)?.replace(/(?:₽|руб\.?)/gi, '').replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : null;
}

export function countSourceEntitiesByType(kind: DataTransferKind, rows: NormalizedRow[]) {
  if (kind !== 'clients') return {};
  const owners = unique(rows.map((row) => clean(row.owner_source_id)).filter(isPresent));
  const animals = unique(rows.map((row) => clean(row.animal_source_id)).filter(isPresent));
  return {
    ...(owners.length ? { owners: owners.length } : {}),
    ...(animals.length ? { animals: animals.length } : {}),
  };
}

function ensureImportFileAllowed(fileName?: string | null) {
  const normalized = (fileName ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const isControlReport = normalized.includes('проверк')
    && (normalized.includes('клиент') || normalized.includes('пациент') || normalized.includes('свод'));
  if (isControlReport) {
    throw new BadRequestException('Это контрольный отчёт, а не файл с карточками. Выберите файл «Клиенты-и-пациенты.csv»');
  }
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function hasAny(row: NormalizedRow, fields: string[]) {
  return fields.some((field) => Boolean(clean(row[field])));
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function jsonNumber(value: Prisma.JsonValue | null, key: string) {
  const candidate = jsonObject(value)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
}

function groupCreatedIds(links: Array<{ targetEntityType: string; targetEntityId: string }>) {
  const grouped = new Map<string, Set<string>>();
  for (const link of links) {
    const ids = grouped.get(link.targetEntityType) ?? new Set<string>();
    ids.add(link.targetEntityId);
    grouped.set(link.targetEntityType, ids);
  }
  return grouped;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function groupBy<T, K>(values: T[], keyOf: (value: T) => K) {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const items = grouped.get(key) ?? [];
    items.push(value);
    grouped.set(key, items);
  }
  return grouped;
}

function compositeKey(...parts: string[]) {
  return parts.join('\u001f');
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function rollbackPriority(type: string) {
  return ({ StockMovement: 110, StockBatch: 100, Vaccination: 95, Bill: 90, VisitDocument: 86, VisitDiagnosis: 85, VisitRecommendation: 84, VisitExam: 83, Visit: 80, Service: 50, Product: 50, ServiceCategory: 40, ProductCategory: 40, Animal: 30, Owner: 10 } as Record<string, number>)[type] ?? 0;
}

async function deleteImportedEntity(tx: Tx, type: string, id: string) {
  if (type === 'StockMovement') return tx.stockMovement.deleteMany({ where: { id } });
  if (type === 'StockBatch') return tx.stockBatch.deleteMany({ where: { id } });
  if (type === 'Vaccination') return tx.vaccination.deleteMany({ where: { id } });
  if (type === 'Bill') return tx.bill.deleteMany({ where: { id } });
  if (type === 'VisitDocument') return tx.visitDocument.deleteMany({ where: { id } });
  if (type === 'VisitDiagnosis') return tx.visitDiagnosis.deleteMany({ where: { id } });
  if (type === 'VisitRecommendation') return tx.visitRecommendation.deleteMany({ where: { id } });
  if (type === 'VisitExam') return tx.visitExam.deleteMany({ where: { id } });
  if (type === 'Visit') return tx.visit.deleteMany({ where: { id } });
  if (type === 'Service') return tx.service.deleteMany({ where: { id } });
  if (type === 'Product') return tx.product.deleteMany({ where: { id } });
  if (type === 'ServiceCategory') return tx.serviceCategory.deleteMany({ where: { id } });
  if (type === 'ProductCategory') return tx.productCategory.deleteMany({ where: { id } });
  if (type === 'Animal') return tx.animal.deleteMany({ where: { id } });
  if (type === 'Owner') return tx.owner.deleteMany({ where: { id } });
  throw new Error(`Неподдерживаемый тип отката: ${type}`);
}
