import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AppointmentStatus,
  BillSource,
  HospitalRecordStatus,
  HospitalStayStatus,
  PaymentStatus,
  Prisma,
  QueueStatus,
  StockMovementType,
  VisitStatus,
} from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AdmitHospitalPatientDto } from './dto/admit-hospital-patient.dto';
import { AdmitExistingHospitalStayDto } from './dto/admit-existing-hospital-stay.dto';
import { CancelHospitalRecordsDto } from './dto/cancel-hospital-records.dto';
import { CreateHospitalAmendmentDto } from './dto/create-hospital-amendment.dto';
import { CreateHospitalRecordDto } from './dto/create-hospital-record.dto';
import { CreateHospitalTreatmentPlanDto } from './dto/create-hospital-treatment-plan.dto';
import { ListHospitalQueryDto } from './dto/list-hospital-query.dto';
import { UpdateHospitalStayDto } from './dto/update-hospital-stay.dto';
import { UpdateHospitalRecordDto } from './dto/update-hospital-record.dto';
import { findUnsafeLateDispositionFields, isPlannedDispositionTransition } from './hospital-record-policy';
import { toStockQuantity } from '../stock/stock-units';
import { resolveServiceUnitPrice, servicePricingSelect } from '../stock/service-pricing';
import { assertPrimaryVisitDiagnosesReady } from '../visits/visit-diagnosis-rules';

type WarehouseScope = string[] | null;

@Injectable()
export class HospitalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
    private readonly financeService: FinanceService,
  ) {}

  async listHospital(query: ListHospitalQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.HospitalStayWhereInput = {
      ...(query.hospitalBoxId ? { hospitalBoxId: query.hospitalBoxId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { owner: { fullName: { contains: search, mode: 'insensitive' } } },
              { owner: { phone: { contains: search, mode: 'insensitive' } } },
              { animal: { nickname: { contains: search, mode: 'insensitive' } } },
              { animal: { species: { contains: search, mode: 'insensitive' } } },
              { hospitalBox: { name: { contains: search, mode: 'insensitive' } } },
              { purpose: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.hospitalStay.findMany({
        where,
        orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
        include: hospitalStayInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.hospitalStay.count({ where }),
    ]);

    return { items: items.map(serializeHospitalStay), total, limit, offset };
  }

  async getResources() {
    const boxes = await this.prisma.hospitalBox.findMany({
      orderBy: { name: 'asc' },
      include: { office: { select: { id: true, name: true } } },
    });

    return { boxes };
  }

  async getCatalog(searchValue: string | undefined, actorId: string) {
    const search = searchValue?.trim().slice(0, 200);
    const warehouseScope = await this.getWarehouseScope(actorId);
    const productWhere: Prisma.ProductWhereInput = search
      ? {
          isActive: true,
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
            { barcodes: { some: { value: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : { isActive: true };
    const serviceWhere: Prisma.ServiceWhereInput = search
      ? { isActive: true, title: { contains: search, mode: 'insensitive' } }
      : { isActive: true };

    const [products, services] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: productWhere,
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          retailPrice: true,
          stockUnit: true,
          writeOffUnit: true,
          billingUnit: true,
          packageQuantity: true,
          batches: {
            where: {
              rest: { gt: 0 },
              ...(warehouseScope ? { warehouseId: { in: warehouseScope } } : {}),
            },
            select: { rest: true },
          },
        },
      }),
      this.prisma.service.findMany({
        where: serviceWhere,
        orderBy: { title: 'asc' },
        select: servicePricingSelect,
      }),
    ]);

    return {
      products: products.map(({ batches, ...product }) => ({
        ...product,
        stockRest: batches.reduce((sum, batch) => sum.plus(batch.rest), decimal(0)),
      })),
      services,
    };
  }

  async getHospitalStay(stayId: string) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { OR: [{ id: stayId }, { sourceVisitId: stayId }] },
      include: hospitalStayInclude,
    });

    if (!stay) {
      throw new NotFoundException('Госпитализация не найдена');
    }

    return serializeHospitalStay(stay);
  }

  async createRecord(stayId: string, dto: CreateHospitalRecordDto, actorId: string) {
    const stay = await this.getExistingHospitalStay(stayId);

    if (stay.status !== HospitalStayStatus.ACTIVE) {
      throw new BadRequestException('Журнал закрыт после выписки или отмены госпитализации');
    }

    const recordStatus = dto.recordStatus ?? HospitalRecordStatus.COMPLETED;
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    this.ensureRecordWithinStay(recordedAt, stay.startedAt, stay.completedAt);
    if (recordStatus !== HospitalRecordStatus.PLANNED) {
      this.ensureTemperatureRecord(dto.recordType, dto.temperatureC);
    }
    const hasCatalogItem = Boolean(dto.serviceId || dto.productId);
    if (recordStatus === HospitalRecordStatus.PLANNED && hasCatalogItem) {
      throw new BadRequestException('Плановое назначение не списывает товар и не начисляет услугу. Проведите позицию при выполнении');
    }
    this.ensureBillingInputHasCatalogItem(hasCatalogItem, dto);
    const warehouseScope = hasCatalogItem ? await this.getWarehouseScope(actorId) : null;

    const record = await this.prisma.$transaction(async (tx) => {
      const line = hasCatalogItem ? await this.resolveCatalogLine(tx, dto) : null;
      const created = await tx.hospitalRecord.create({
        data: {
          visitId: stay.sourceVisitId,
          plannedProductId: line?.productId,
          plannedServiceId: line?.serviceId,
          plannedQuantity: line?.quantity,
          plannedStockQuantity: line?.stockQuantity,
          plannedUnitPrice: line?.unitPrice,
          recordedById: actorId,
          performedById: recordStatus === HospitalRecordStatus.COMPLETED ? actorId : null,
          recordType: dto.recordType,
          recordStatus,
          createdAsPlan: recordStatus === HospitalRecordStatus.PLANNED,
          title: dto.title.trim(),
          recordedAt,
          completedAt: recordStatus === HospitalRecordStatus.COMPLETED
            ? (dto.completedAt ? new Date(dto.completedAt) : recordedAt)
            : null,
          temperatureC: dto.recordType === 'TEMPERATURE' ? dto.temperatureC : null,
          value: dto.recordType === 'TEMPERATURE' ? null : dto.value?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
        include: hospitalRecordInclude,
      });

      if (line?.productId) {
        await this.writeOffHospitalProduct(tx, stay.sourceVisitId, null, created.id, line, warehouseScope);
      }

      return created;
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.record.create',
      entityType: 'HospitalRecord',
      entityId: record.id,
      metadata: {
        stayId: stay.id,
        sourceVisitId: stay.sourceVisitId,
        recordType: dto.recordType,
        recordStatus,
        billItemId: record.billItemId,
        productId: dto.productId,
        serviceId: dto.serviceId,
      },
    });

    return record;
  }

  async createTreatmentPlan(stayId: string, dto: CreateHospitalTreatmentPlanDto, actorId: string) {
    const stay = await this.getExistingHospitalStay(stayId);

    if (stay.status !== HospitalStayStatus.ACTIVE) {
      throw new BadRequestException('План лечения можно назначить только во время активного стационара');
    }

    const recordCount = dto.items.reduce((sum, item) => sum + item.scheduledAt.length, 0);
    if (recordCount > 200) {
      throw new BadRequestException('В одном плане лечения может быть не более 200 отдельных выполнений');
    }

    const plan = await this.prisma.$transaction(async (tx) => {
      const records: Prisma.HospitalRecordCreateWithoutTreatmentPlanInput[] = [];

      for (const item of dto.items) {
        const uniqueDates = new Set(item.scheduledAt);
        if (uniqueDates.size !== item.scheduledAt.length) {
          throw new BadRequestException(`В назначении «${item.title.trim()}» повторяется одна и та же дата`);
        }

        const hasCatalogItem = Boolean(item.productId || item.serviceId);
        this.ensureBillingInputHasCatalogItem(hasCatalogItem, item);
        const line = hasCatalogItem
          ? await this.resolveCatalogLine(tx, {
              recordType: item.recordType,
              title: item.title,
              productId: item.productId,
              serviceId: item.serviceId,
              quantity: item.quantity,
              stockQuantity: item.stockQuantity,
              unitPrice: item.unitPrice,
            })
          : null;
        const treatmentPlanItemId = randomUUID();

        for (const recordedAt of [...uniqueDates]
          .map((value) => new Date(value))
          .sort((left, right) => left.getTime() - right.getTime())) {
          this.ensureRecordWithinStay(recordedAt, stay.startedAt, stay.completedAt);
          records.push({
            visit: { connect: { id: stay.sourceVisitId } },
            recordedBy: { connect: { id: actorId } },
            treatmentPlanItemId,
            plannedProduct: line?.productId ? { connect: { id: line.productId } } : undefined,
            plannedService: line?.serviceId ? { connect: { id: line.serviceId } } : undefined,
            plannedQuantity: line?.quantity,
            plannedStockQuantity: line?.stockQuantity,
            plannedUnitPrice: line?.unitPrice,
            recordType: item.recordType,
            recordStatus: HospitalRecordStatus.PLANNED,
            createdAsPlan: true,
            title: line?.title ?? item.title.trim(),
            recordedAt,
            completedAt: null,
            temperatureC: null,
            value: cleanOrNull(item.value ?? ''),
            notes: cleanOrNull(item.notes ?? ''),
          });
        }
      }

      return tx.hospitalTreatmentPlan.create({
        data: {
          visitId: stay.sourceVisitId,
          createdById: actorId,
          title: cleanOrNull(dto.title ?? ''),
          records: { create: records },
        },
        include: {
          records: {
            orderBy: { recordedAt: 'asc' },
            include: hospitalRecordBaseInclude,
          },
        },
      });
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.treatment_plan.create',
      entityType: 'HospitalTreatmentPlan',
      entityId: plan.id,
      metadata: {
        stayId: stay.id,
        sourceVisitId: stay.sourceVisitId,
        itemCount: dto.items.length,
        recordCount,
        catalogItemCount: dto.items.filter((item) => item.productId || item.serviceId).length,
      },
    });

    return plan;
  }

  async updateRecord(stayId: string, recordId: string, dto: UpdateHospitalRecordDto, actorId: string) {
    const stay = await this.getExistingHospitalStay(stayId);
    const existing = await this.prisma.hospitalRecord.findFirst({
      where: { id: recordId, visitId: stay.sourceVisitId },
      include: {
        billItem: true,
        amendments: {
          where: plannedCatalogAmendmentWhere,
          orderBy: { recordedAt: 'desc' },
          take: 1,
          select: plannedCatalogSnapshotSelect,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Запись журнала стационара не найдена');
    }

    if (stay.status !== HospitalStayStatus.ACTIVE) {
      throw new BadRequestException('После выписки прямое редактирование закрыто. Добавьте исправление с причиной');
    }
    if (existing.recordStatus === HospitalRecordStatus.AMENDMENT) {
      throw new BadRequestException('Исправление является неизменяемым событием. Создайте новое исправление к исходной записи');
    }
    const recordDayClosed = dateKeyInTimeZone(existing.recordedAt, stay.hospitalBox.office.timezone)
      < dateKeyInTimeZone(new Date(), stay.hospitalBox.office.timezone);
    const lateDisposition = recordDayClosed
      && isPlannedDispositionTransition(existing.recordStatus, dto.recordStatus);

    if (recordDayClosed && !lateDisposition) {
      this.ensureDirectRecordEditAllowed(existing.recordedAt, stay.hospitalBox.office.timezone);
    }
    if (lateDisposition) {
      const unsafeFields = findUnsafeLateDispositionFields(dto);
      if (unsafeFields.length) {
        throw new BadRequestException(
          'Назначение прошлых суток можно только отметить выполненным или отменённым. Для изменения текста добавьте исправление с причиной',
        );
      }
    }

    const nextRecordType = dto.recordType ?? existing.recordType;
    const nextRecordStatus = dto.recordStatus ?? existing.recordStatus;
    const nextTemperature = dto.temperatureC ?? decimalToOptionalNumber(existing.temperatureC);
    if (nextRecordStatus !== HospitalRecordStatus.PLANNED && nextRecordStatus !== HospitalRecordStatus.SKIPPED) {
      this.ensureTemperatureRecord(nextRecordType, nextTemperature);
    }
    const nextRecordedAt = dto.recordedAt ? new Date(dto.recordedAt) : existing.recordedAt;
    this.ensureRecordWithinStay(nextRecordedAt, stay.startedAt, stay.completedAt);
    const completingPlannedRecord = existing.recordStatus === HospitalRecordStatus.PLANNED
      && nextRecordStatus === HospitalRecordStatus.COMPLETED;
    const effectivePlannedCatalog = getEffectivePlannedCatalog(existing);
    const billingSnapshot = existing.billItem ?? effectivePlannedCatalog;
    const billingChanged = hasHospitalBillingChanged(billingSnapshot, dto);
    const plannedProductId = dto.productId ?? effectivePlannedCatalog.productId ?? undefined;
    const plannedServiceId = dto.serviceId ?? effectivePlannedCatalog.serviceId ?? undefined;
    const hasCatalogItemForCompletion = Boolean(plannedProductId || plannedServiceId);
    const shouldStagePlannedCatalog = completingPlannedRecord && !existing.billItem && hasCatalogItemForCompletion;

    if (dto.productId && dto.serviceId) {
      throw new BadRequestException('В одной записи можно выбрать товар или услугу, но не оба варианта одновременно');
    }
    if (effectivePlannedCatalog.productId && (dto.serviceId || (dto.productId && dto.productId !== effectivePlannedCatalog.productId))) {
      throw new BadRequestException('Товар уже зафиксирован в плане лечения. Для другого товара создайте новое назначение');
    }
    if (effectivePlannedCatalog.serviceId && (dto.productId || (dto.serviceId && dto.serviceId !== effectivePlannedCatalog.serviceId))) {
      throw new BadRequestException('Услуга уже зафиксирована в плане лечения. Для другой услуги создайте новое назначение');
    }
    if ((dto.productId || dto.serviceId) && !completingPlannedRecord) {
      throw new BadRequestException('Товар или услугу можно выбрать только при выполнении планового назначения');
    }
    if (billingChanged && !existing.billItem && !hasCatalogItemForCompletion) {
      throw new BadRequestException('У этой записи нет связанной позиции счёта. Добавьте новую запись с товаром или услугой');
    }
    if (nextRecordStatus === HospitalRecordStatus.PLANNED && existing.billItem) {
      throw new BadRequestException('Начисленную позицию нельзя вернуть в план. Создайте отдельное плановое назначение');
    }

    const warehouseScope = (billingChanged && (existing.billItem?.productId || effectivePlannedCatalog.productId))
      || (shouldStagePlannedCatalog && plannedProductId)
      ? await this.getWarehouseScope(actorId)
      : null;

    const record = await this.prisma.$transaction(async (tx) => {
      let postedLine: HospitalCatalogLine | null = null;

      if (shouldStagePlannedCatalog) {
        await tx.$queryRaw`SELECT "id" FROM "HospitalRecord" WHERE "id" = ${existing.id} FOR UPDATE`;
        const lockedRecord = await tx.hospitalRecord.findUniqueOrThrow({
          where: { id: existing.id },
          select: {
            recordStatus: true,
            billItemId: true,
            plannedProductId: true,
            plannedServiceId: true,
            plannedQuantity: true,
            plannedStockQuantity: true,
            plannedUnitPrice: true,
            amendments: {
              where: plannedCatalogAmendmentWhere,
              orderBy: { recordedAt: 'desc' },
              take: 1,
              select: plannedCatalogSnapshotSelect,
            },
          },
        });

        if (lockedRecord.recordStatus === HospitalRecordStatus.PLANNED && !lockedRecord.billItemId) {
          const lockedPlannedCatalog = getEffectivePlannedCatalog(lockedRecord);
          const usesStoredPlannedPrice = dto.unitPrice === undefined && lockedPlannedCatalog.unitPrice !== null;
          postedLine = await this.resolveCatalogLine(tx, {
            recordType: nextRecordType as CreateHospitalRecordDto['recordType'],
            title: dto.title ?? existing.title,
            productId: dto.productId ?? lockedPlannedCatalog.productId ?? undefined,
            serviceId: dto.serviceId ?? lockedPlannedCatalog.serviceId ?? undefined,
            quantity: dto.quantity ?? decimalToOptionalNumber(lockedPlannedCatalog.quantity),
            stockQuantity: dto.stockQuantity ?? decimalToOptionalNumber(lockedPlannedCatalog.stockQuantity),
            unitPrice: dto.unitPrice ?? decimalToOptionalNumber(lockedPlannedCatalog.unitPrice),
          }, { preserveStoredServicePrice: usesStoredPlannedPrice });
          if (postedLine.productId) {
            await this.writeOffHospitalProduct(tx, stay.sourceVisitId, null, existing.id, postedLine, warehouseScope);
          }
        } else if (lockedRecord.recordStatus === HospitalRecordStatus.COMPLETED) {
          return tx.hospitalRecord.findUniqueOrThrow({
            where: { id: existing.id },
            include: hospitalRecordInclude,
          });
        } else {
          throw new BadRequestException('Назначение уже было обработано другим сотрудником. Обновите лист стационара');
        }
      }

      if (billingChanged && existing.billItem) {
        const bill = await tx.bill.findUnique({
          where: { id: existing.billItem.billId },
          select: { id: true, status: true, paidAmount: true },
        });
        this.ensureBillEditable(bill);
        const serviceUnitPrice = existing.billItem.serviceId && dto.unitPrice !== undefined
          ? resolveServiceUnitPrice(
              await tx.service.findUniqueOrThrow({ where: { id: existing.billItem.serviceId }, select: servicePricingSelect }),
              dto.unitPrice,
            )
          : dto.unitPrice;
        const line = calculateCatalogLine({
          serviceId: existing.billItem.serviceId ?? undefined,
          productId: existing.billItem.productId ?? undefined,
          title: existing.billItem.title,
          quantity: dto.quantity ?? decimalToNumber(existing.billItem.quantity),
          stockQuantity: dto.stockQuantity
            ?? (existing.billItem.stockQuantity === null
              ? decimalToNumber(existing.billItem.quantity)
              : decimalToNumber(existing.billItem.stockQuantity)),
          unitPrice: serviceUnitPrice ?? decimalToNumber(existing.billItem.unitPrice),
        });

        await tx.billItem.update({
          where: { id: existing.billItem.id },
          data: {
            quantity: line.quantity,
            stockQuantity: line.stockQuantity,
            unitPrice: line.unitPrice,
            totalAmount: line.totalAmount,
          },
        });

        if (line.productId) {
          await this.syncHospitalProductWriteOff(
            tx,
            stay.sourceVisitId,
            existing.billItem.id,
            existing.id,
            line,
            warehouseScope,
          );
        }

        await this.recalculateHospitalBill(tx, existing.billItem.billId, stay.sourceVisitId);
      } else if (billingChanged && !existing.billItem && existing.recordStatus === HospitalRecordStatus.COMPLETED) {
        postedLine = await this.resolveCatalogLine(tx, {
          recordType: nextRecordType as CreateHospitalRecordDto['recordType'],
          title: dto.title ?? existing.title,
          productId: effectivePlannedCatalog.productId ?? undefined,
          serviceId: effectivePlannedCatalog.serviceId ?? undefined,
          quantity: dto.quantity ?? decimalToOptionalNumber(effectivePlannedCatalog.quantity),
          stockQuantity: dto.stockQuantity ?? decimalToOptionalNumber(effectivePlannedCatalog.stockQuantity),
          unitPrice: dto.unitPrice ?? decimalToOptionalNumber(effectivePlannedCatalog.unitPrice),
        }, { preserveStoredServicePrice: dto.unitPrice === undefined });
        if (postedLine.productId) {
          await this.syncHospitalProductWriteOff(
            tx,
            stay.sourceVisitId,
            null,
            existing.id,
            postedLine,
            warehouseScope,
          );
        }
      }

      return tx.hospitalRecord.update({
        where: { id: existing.id },
        data: {
          ...(postedLine?.productId ? { plannedProductId: postedLine.productId } : {}),
          ...(postedLine?.serviceId ? { plannedServiceId: postedLine.serviceId } : {}),
          ...(postedLine ? {
            plannedQuantity: postedLine.quantity,
            plannedStockQuantity: postedLine.stockQuantity,
            plannedUnitPrice: postedLine.unitPrice,
          } : {}),
          ...(dto.recordType !== undefined ? { recordType: dto.recordType } : {}),
          ...(dto.recordStatus !== undefined ? { recordStatus: dto.recordStatus } : {}),
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.recordedAt !== undefined ? { recordedAt: new Date(dto.recordedAt) } : {}),
          ...(dto.recordStatus === HospitalRecordStatus.COMPLETED
            ? {
                performedById: actorId,
                completedAt: dto.completedAt ? new Date(dto.completedAt) : existing.completedAt ?? new Date(),
                cancelledById: null,
                cancelledAt: null,
              }
            : dto.recordStatus === HospitalRecordStatus.SKIPPED
              ? {
                  performedById: null,
                  completedAt: null,
                  cancelledById: actorId,
                  cancelledAt: new Date(),
                }
              : dto.recordStatus === HospitalRecordStatus.PLANNED
                ? {
                    performedById: null,
                    completedAt: null,
                    cancelledById: null,
                    cancelledAt: null,
                  }
                : dto.completedAt !== undefined
                  ? { completedAt: new Date(dto.completedAt) }
                  : {}),
          ...(nextRecordType === 'TEMPERATURE'
            ? (dto.temperatureC !== undefined ? { temperatureC: dto.temperatureC, value: null } : { value: null })
            : { temperatureC: null, ...(dto.value !== undefined ? { value: cleanOrNull(dto.value) } : {}) }),
          ...(dto.notes !== undefined ? { notes: cleanOrNull(dto.notes) } : {}),
        },
        include: hospitalRecordInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.record.update',
      entityType: 'HospitalRecord',
      entityId: record.id,
      metadata: {
        stayId: stay.id,
        sourceVisitId: stay.sourceVisitId,
        changedFields: Object.keys(dto),
        billItemId: record.billItemId,
        plannedProductId: record.plannedProductId,
        plannedServiceId: record.plannedServiceId,
        previousStatus: existing.recordStatus,
        nextStatus: record.recordStatus,
        lateDisposition,
      },
    });

    return record;
  }

  async cancelRecords(
    stayId: string,
    recordId: string,
    dto: CancelHospitalRecordsDto,
    actorId: string,
  ) {
    const stay = await this.getExistingHospitalStay(stayId);
    if (stay.status !== HospitalStayStatus.ACTIVE) {
      throw new BadRequestException('Назначения можно отменять только во время активного стационара');
    }

    const target = await this.prisma.hospitalRecord.findFirst({
      where: { id: recordId, visitId: stay.sourceVisitId },
      select: { id: true, recordStatus: true, treatmentPlanItemId: true, recordedAt: true },
    });
    if (!target) {
      throw new NotFoundException('Назначение не найдено');
    }
    if (target.recordStatus !== HospitalRecordStatus.PLANNED) {
      throw new BadRequestException('Отменить можно только ожидающее выполнения назначение');
    }

    const cancelSeries = dto.scope === 'THIS_AND_FUTURE' && Boolean(target.treatmentPlanItemId);
    const cancelledAt = new Date();
    const result = await this.prisma.hospitalRecord.updateMany({
      where: {
        visitId: stay.sourceVisitId,
        recordStatus: HospitalRecordStatus.PLANNED,
        ...(cancelSeries
          ? { treatmentPlanItemId: target.treatmentPlanItemId, recordedAt: { gte: target.recordedAt } }
          : { id: target.id }),
      },
      data: {
        recordStatus: HospitalRecordStatus.SKIPPED,
        completedAt: null,
        performedById: null,
        cancelledById: actorId,
        cancelledAt,
      },
    });
    if (result.count === 0) {
      throw new BadRequestException('Назначение уже обработано другим сотрудником. Обновите лист стационара');
    }

    await this.auditService.log({
      actorId,
      action: 'hospital.record.cancel',
      entityType: 'HospitalRecord',
      entityId: target.id,
      metadata: { stayId: stay.id, scope: cancelSeries ? 'THIS_AND_FUTURE' : 'ONE', count: result.count },
    });

    return { count: result.count };
  }

  async createAmendment(stayId: string, recordId: string, dto: CreateHospitalAmendmentDto, actorId: string) {
    const stay = await this.getExistingHospitalStay(stayId);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "HospitalRecord" WHERE "id" = ${recordId} FOR UPDATE`;
      const existing = await tx.hospitalRecord.findFirst({
        where: { id: recordId, visitId: stay.sourceVisitId },
        select: {
          id: true,
          recordType: true,
          recordStatus: true,
          title: true,
          recordedAt: true,
          plannedProductId: true,
          plannedServiceId: true,
          plannedQuantity: true,
          plannedStockQuantity: true,
          plannedUnitPrice: true,
          amendments: {
            where: plannedCatalogAmendmentWhere,
            orderBy: { recordedAt: 'desc' },
            take: 1,
            select: plannedCatalogSnapshotSelect,
          },
        },
      });

      if (!existing) {
        throw new NotFoundException('Исходная запись журнала стационара не найдена');
      }
      if (existing.recordStatus === HospitalRecordStatus.AMENDMENT) {
        throw new BadRequestException('Исправление добавляется к исходной записи, а не к другому исправлению');
      }

      this.ensureTemperatureRecord(dto.recordType, dto.temperatureC);
      const planCorrectionRequested = dto.quantity !== undefined
        || dto.stockQuantity !== undefined
        || dto.unitPrice !== undefined;
      const currentPlan = getEffectivePlannedCatalog(existing);
      let correctedPlan: HospitalCatalogLine | null = null;

      if (planCorrectionRequested) {
        if (existing.recordStatus !== HospitalRecordStatus.PLANNED) {
          throw new BadRequestException('Проведённое списание нельзя переписать исправлением. Создайте отдельное складское корректирующее движение');
        }
        if (!currentPlan.productId && !currentPlan.serviceId) {
          throw new BadRequestException('У исходного назначения нет связанного товара или услуги');
        }
        if (dto.stockQuantity !== undefined && !currentPlan.productId) {
          throw new BadRequestException('Количество списания применяется только к товару');
        }

        correctedPlan = await this.resolveCatalogLine(tx, {
          recordType: existing.recordType as CreateHospitalRecordDto['recordType'],
          title: existing.title,
          productId: currentPlan.productId ?? undefined,
          serviceId: currentPlan.serviceId ?? undefined,
          quantity: dto.quantity ?? decimalToOptionalNumber(currentPlan.quantity),
          stockQuantity: dto.stockQuantity ?? decimalToOptionalNumber(currentPlan.stockQuantity),
          unitPrice: dto.unitPrice ?? decimalToOptionalNumber(currentPlan.unitPrice),
        });
      }

      const amendment = await tx.hospitalRecord.create({
        data: {
          visitId: stay.sourceVisitId,
          recordedById: actorId,
          recordType: dto.recordType,
          recordStatus: HospitalRecordStatus.AMENDMENT,
          createdAsPlan: false,
          title: dto.title.trim(),
          recordedAt: new Date(),
          completedAt: new Date(),
          temperatureC: dto.recordType === 'TEMPERATURE' ? dto.temperatureC : null,
          value: dto.recordType === 'TEMPERATURE' ? null : (dto.value === undefined ? null : cleanOrNull(dto.value)),
          notes: dto.notes === undefined ? null : cleanOrNull(dto.notes),
          parentRecordId: existing.id,
          amendmentReason: dto.reason.trim(),
          ...(correctedPlan ? {
            plannedProductId: correctedPlan.productId,
            plannedServiceId: correctedPlan.serviceId,
            plannedQuantity: correctedPlan.quantity,
            plannedStockQuantity: correctedPlan.stockQuantity,
            plannedUnitPrice: correctedPlan.unitPrice,
          } : {}),
        },
        include: hospitalRecordBaseInclude,
      });

      return {
        amendment,
        originalRecordedAt: existing.recordedAt,
        planCorrection: correctedPlan ? {
          productId: correctedPlan.productId,
          serviceId: correctedPlan.serviceId,
          previousQuantity: decimalToOptionalNumber(currentPlan.quantity),
          previousStockQuantity: decimalToOptionalNumber(currentPlan.stockQuantity),
          previousUnitPrice: decimalToOptionalNumber(currentPlan.unitPrice),
          quantity: decimalToNumber(correctedPlan.quantity),
          stockQuantity: correctedPlan.stockQuantity === null ? undefined : decimalToNumber(correctedPlan.stockQuantity),
          unitPrice: decimalToNumber(correctedPlan.unitPrice),
        } : null,
      };
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.record.amend',
      entityType: 'HospitalRecord',
      entityId: result.amendment.id,
      metadata: {
        stayId: stay.id,
        sourceVisitId: stay.sourceVisitId,
        parentRecordId: recordId,
        originalRecordedAt: result.originalRecordedAt,
        reason: dto.reason.trim(),
        planCorrection: result.planCorrection,
      },
    });

    return result.amendment;
  }

  async admitExisting(visitId: string, dto: AdmitExistingHospitalStayDto, actorId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        ownerId: true,
        animalId: true,
        employeeId: true,
        appointmentId: true,
        queueEntryId: true,
        visitType: true,
        status: true,
        startedAt: true,
        diagnoses: { select: { diagnosisType: true } },
        exam: { select: { purpose: true } },
        hospitalStay: { select: { id: true } },
      },
    });

    if (!visit) {
      throw new NotFoundException('Приём не найден');
    }

    if (visit.hospitalStay) {
      return this.getHospitalStay(visit.hospitalStay.id);
    }

    if (visit.status !== VisitStatus.DRAFT && visit.status !== VisitStatus.IN_PROGRESS) {
      throw new BadRequestException('В стационар можно перевести только пациента из активного приёма');
    }

    assertPrimaryVisitDiagnosesReady(
      { visitType: visit.visitType },
      visit.diagnoses,
    );

    const box = await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);
    const responsibleEmployeeId = dto.employeeId ?? visit.employeeId;

    if (responsibleEmployeeId) {
      await this.schedulingService.ensureEmployeeActive(responsibleEmployeeId);
    }

    const completedAt = new Date();
    const stay = await this.prisma.$transaction(async (tx) => {
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: VisitStatus.COMPLETED, completedAt },
      });

      if (visit.appointmentId) {
        await tx.appointment.update({
          where: { id: visit.appointmentId },
          data: { status: AppointmentStatus.COMPLETED },
        });
      }

      if (visit.queueEntryId) {
        await tx.queueEntry.update({
          where: { id: visit.queueEntryId },
          data: { status: QueueStatus.COMPLETED },
        });
      }

      return tx.hospitalStay.create({
        data: {
          sourceVisitId: visit.id,
          ownerId: visit.ownerId,
          animalId: visit.animalId,
          employeeId: responsibleEmployeeId,
          hospitalBoxId: box.id,
          purpose: visit.exam?.purpose,
          startedAt: completedAt,
          status: HospitalStayStatus.ACTIVE,
        },
        select: { id: true },
      });
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.admit.existing',
      entityType: 'HospitalStay',
      entityId: stay.id,
      metadata: { sourceVisitId: visit.id, hospitalBoxId: box.id },
    });

    return this.getHospitalStay(stay.id);
  }

  async admit(dto: AdmitHospitalPatientDto, actorId: string) {
    const ownerId = await this.schedulingService.resolveAnimalOwner(dto.animalId, dto.ownerId);
    const box = await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);
    const admittedAt = dto.admittedAt ? new Date(dto.admittedAt) : new Date();

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const sourceVisit = await tx.visit.create({
        data: {
          ownerId,
          animalId: dto.animalId,
          employeeId: dto.employeeId,
          startedAt: admittedAt,
          completedAt: admittedAt,
          status: VisitStatus.COMPLETED,
          exam: dto.purpose ? { create: { purpose: dto.purpose } } : undefined,
        },
      });

      const stay = await tx.hospitalStay.create({
        data: {
          sourceVisitId: sourceVisit.id,
          ownerId,
          animalId: dto.animalId,
          employeeId: dto.employeeId,
          hospitalBoxId: box.id,
          purpose: dto.purpose?.trim() || null,
          startedAt: admittedAt,
          status: HospitalStayStatus.ACTIVE,
        },
        select: { id: true },
      });

      return { sourceVisitId: sourceVisit.id, stayId: stay.id };
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.admit',
      entityType: 'HospitalStay',
      entityId: created.stayId,
      metadata: { ownerId, animalId: dto.animalId, hospitalBoxId: box.id, sourceVisitId: created.sourceVisitId },
    });

    return this.getHospitalStay(created.stayId);
  }

  async updateStay(stayId: string, dto: UpdateHospitalStayDto, actorId: string) {
    const existing = await this.getExistingHospitalStay(stayId);

    if (existing.status !== HospitalStayStatus.ACTIVE) {
      throw new BadRequestException('Закрытую госпитализацию нельзя переводить или переназначать');
    }

    if (dto.hospitalBoxId) {
      await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);
    }

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
    }

    await this.prisma.hospitalStay.update({
      where: { id: existing.id },
      data: {
        ...(dto.hospitalBoxId !== undefined ? { hospitalBoxId: dto.hospitalBoxId } : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
      },
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.update',
      entityType: 'HospitalStay',
      entityId: existing.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return this.getHospitalStay(existing.id);
  }

  async discharge(stayId: string, actorId: string) {
    const existing = await this.getExistingHospitalStay(stayId);

    if (existing.status === HospitalStayStatus.CANCELLED) {
      throw new BadRequestException('Отменённую госпитализацию нельзя завершить выпиской');
    }

    const dueAt = await this.financeService.getDefaultBillDueAt();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "HospitalStay" WHERE "id" = ${existing.id} FOR UPDATE`;
      const lockedStay = await tx.hospitalStay.findUniqueOrThrow({
        where: { id: existing.id },
        select: { status: true },
      });
      if (lockedStay.status === HospitalStayStatus.CANCELLED) {
        throw new BadRequestException('Отменённую госпитализацию нельзя завершить выпиской');
      }
      if (lockedStay.status === HospitalStayStatus.DISCHARGED) return;

      const bill = await this.getEditableHospitalBill(tx, existing.sourceVisitId, dueAt);
      const pendingRecords = await tx.hospitalRecord.findMany({
        where: {
          visitId: existing.sourceVisitId,
          recordStatus: HospitalRecordStatus.COMPLETED,
          billItemId: null,
          OR: [{ plannedProductId: { not: null } }, { plannedServiceId: { not: null } }],
        },
        orderBy: { recordedAt: 'asc' },
      });

      for (const record of pendingRecords) {
        const line = calculateCatalogLine({
          productId: record.plannedProductId ?? undefined,
          serviceId: record.plannedServiceId ?? undefined,
          title: record.title,
          quantity: record.plannedQuantity ?? 1,
          stockQuantity: record.plannedStockQuantity ?? undefined,
          unitPrice: record.plannedUnitPrice ?? 0,
        });
        const billItem = await tx.billItem.create({
          data: {
            billId: bill.id,
            productId: line.productId,
            serviceId: line.serviceId,
            title: line.title,
            quantity: line.quantity,
            stockQuantity: line.stockQuantity,
            unitPrice: line.unitPrice,
            discount: 0,
            totalAmount: line.totalAmount,
          },
        });
        await tx.hospitalRecord.update({ where: { id: record.id }, data: { billItemId: billItem.id } });
        await tx.stockMovement.updateMany({
          where: { hospitalRecordId: record.id, billItemId: null },
          data: { billItemId: billItem.id },
        });
      }

      await this.recalculateHospitalBill(tx, bill.id, existing.sourceVisitId);
      await tx.hospitalStay.update({
        where: { id: existing.id },
        data: { status: HospitalStayStatus.DISCHARGED, completedAt: new Date() },
      });
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.discharge',
      entityType: 'HospitalStay',
      entityId: existing.id,
      metadata: { sourceVisitId: existing.sourceVisitId },
    });

    return this.getHospitalStay(existing.id);
  }

  async cancel(stayId: string, actorId: string) {
    const existing = await this.getExistingHospitalStay(stayId);

    await this.prisma.hospitalStay.update({
      where: { id: existing.id },
      data: { status: HospitalStayStatus.CANCELLED, completedAt: new Date() },
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.cancel',
      entityType: 'HospitalStay',
      entityId: existing.id,
      metadata: { sourceVisitId: existing.sourceVisitId },
    });

    return this.getHospitalStay(existing.id);
  }

  private ensureTemperatureRecord(recordType: string, temperatureC?: number | null) {
    if (recordType === 'TEMPERATURE' && temperatureC === undefined) {
      throw new BadRequestException('Для записи температуры укажите значение от 30,0 до 45,0 °C');
    }
  }

  private ensureBillingInputHasCatalogItem(
    hasCatalogItem: boolean,
    dto: Pick<CreateHospitalRecordDto, 'quantity' | 'stockQuantity' | 'unitPrice'>,
  ) {
    if (!hasCatalogItem && (dto.quantity !== undefined || dto.stockQuantity !== undefined || dto.unitPrice !== undefined)) {
      throw new BadRequestException('Сначала выберите товар или услугу из каталога');
    }
  }

  private async resolveCatalogLine(
    tx: Prisma.TransactionClient,
    dto: CreateHospitalRecordDto,
    options: { preserveStoredServicePrice?: boolean } = {},
  ) {
    if (dto.serviceId && dto.productId) {
      throw new BadRequestException('В одной записи можно выбрать товар или услугу, но не оба варианта одновременно');
    }

    const service = dto.serviceId
      ? await tx.service.findFirst({
          where: { id: dto.serviceId, isActive: true },
          select: servicePricingSelect,
        })
      : null;
    if (dto.serviceId && !service) {
      throw new NotFoundException('Услуга из каталога не найдена');
    }

    const product = dto.productId
      ? await tx.product.findFirst({
          where: { id: dto.productId, isActive: true },
          select: { id: true, title: true, retailPrice: true },
        })
      : null;
    if (dto.productId && !product) {
      throw new NotFoundException('Товар из каталога не найден');
    }

    return calculateCatalogLine({
      serviceId: service?.id,
      productId: product?.id,
      title: service?.title ?? product?.title,
      quantity: dto.quantity ?? 1,
      stockQuantity: product ? dto.stockQuantity ?? dto.quantity ?? 1 : undefined,
      unitPrice: (service
        ? options.preserveStoredServicePrice && dto.unitPrice !== undefined
          ? dto.unitPrice
          : resolveServiceUnitPrice(service, dto.unitPrice)
        : dto.unitPrice)
        ?? (product ? decimalToNumber(product.retailPrice) : 0),
    });
  }

  private async getEditableHospitalBill(
    tx: Prisma.TransactionClient,
    visitId: string,
    dueAt: Date | null,
  ) {
    const visit = await tx.visit.findUnique({
      where: { id: visitId },
      select: { id: true, ownerId: true, animalId: true },
    });
    if (!visit) {
      throw new NotFoundException('Приём, связанный со стационаром, не найден');
    }

    const existing = await tx.bill.findUnique({
      where: { visitId },
      select: { id: true, status: true, totalAmount: true, paidAmount: true },
    });
    if (existing) {
      if (existing.status === PaymentStatus.CANCELLED) {
        const status = resolvePaymentStatus(existing.totalAmount, existing.paidAmount);
        return tx.bill.update({
          where: { id: existing.id },
          data: { status },
          select: { id: true, status: true, paidAmount: true },
        });
      }
      return existing;
    }

    return tx.bill.create({
      data: {
        ownerId: visit.ownerId,
        animalId: visit.animalId,
        visitId,
        source: BillSource.VISIT,
        status: PaymentStatus.UNPAID,
        dueAt,
      },
      select: { id: true, status: true, paidAmount: true },
    });
  }

  private ensureBillEditable(bill: { id: string; status: PaymentStatus; paidAmount: Prisma.Decimal } | null) {
    if (!bill) {
      throw new NotFoundException('Счёт стационара не найден');
    }
    if (bill.status === PaymentStatus.CANCELLED) {
      throw new BadRequestException('Отменённый счёт нельзя изменять');
    }
    if (decimal(bill.paidAmount).greaterThan(0)) {
      throw new BadRequestException('Позиции уже оплаченного счёта нельзя изменять');
    }
  }

  private async writeOffHospitalProduct(
    tx: Prisma.TransactionClient,
    visitId: string,
    billItemId: string | null,
    hospitalRecordId: string,
    line: HospitalCatalogLine,
    warehouseScope: WarehouseScope,
    quantityIsInStockUnits = false,
  ) {
    if (!line.productId) {
      return;
    }

    const product = await tx.product.findUniqueOrThrow({
      where: { id: line.productId },
      select: { stockUnit: true, writeOffUnit: true, packageQuantity: true },
    });
    const requested = line.stockQuantity ?? line.quantity;
    const stockQuantity = quantityIsInStockUnits ? requested : toStockQuantity(product, requested);
    const batches = await tx.stockBatch.findMany({
      where: {
        productId: line.productId,
        rest: { gt: 0 },
        ...(warehouseScope ? { warehouseId: { in: warehouseScope } } : {}),
      },
      select: { id: true, warehouseId: true, rest: true, expiresAt: true, createdAt: true },
    });
    const orderedBatches = batches.sort(compareStockBatches);
    const available = orderedBatches.reduce((sum, batch) => sum.plus(batch.rest), decimal(0));

    if (available.lessThan(stockQuantity)) {
      throw new BadRequestException(`Недостаточно остатка товара «${line.title}»`);
    }

    let remaining = stockQuantity;
    for (const batch of orderedBatches) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const batchRest = decimal(batch.rest);
      const quantity = batchRest.lessThan(remaining) ? batchRest : remaining;
      await tx.stockBatch.update({ where: { id: batch.id }, data: { rest: { decrement: quantity } } });
      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          billItemId,
          hospitalRecordId,
          stockBatchId: batch.id,
          warehouseId: batch.warehouseId,
          visitId,
          type: StockMovementType.VISIT_USAGE,
          quantity: quantity.negated(),
          comment: `Списание по стационару ${visitId.slice(0, 8)}`,
        },
      });
      remaining = remaining.minus(quantity);
    }
  }

  private async syncHospitalProductWriteOff(
    tx: Prisma.TransactionClient,
    visitId: string,
    billItemId: string | null,
    hospitalRecordId: string,
    line: HospitalCatalogLine,
    warehouseScope: WarehouseScope,
  ) {
    if (!line.productId) return;
    const product = await tx.product.findUniqueOrThrow({
      where: { id: line.productId },
      select: { stockUnit: true, writeOffUnit: true, packageQuantity: true },
    });
    const deducted = await this.getHospitalProductDeductedQuantity(tx, billItemId, hospitalRecordId, line.productId);
    const delta = toStockQuantity(product, line.stockQuantity ?? line.quantity).minus(deducted);

    if (delta.greaterThan(0)) {
      await this.writeOffHospitalProduct(tx, visitId, billItemId, hospitalRecordId, { ...line, stockQuantity: delta }, warehouseScope, true);
    } else if (delta.lessThan(0)) {
      await this.restoreHospitalProduct(tx, visitId, billItemId, hospitalRecordId, line.productId, line.title, delta.abs());
    }
  }

  private async restoreHospitalProduct(
    tx: Prisma.TransactionClient,
    visitId: string,
    billItemId: string | null,
    hospitalRecordId: string,
    productId: string,
    title: string,
    quantityToRestore: Prisma.Decimal.Value,
  ) {
    let remaining = decimal(quantityToRestore);
    const movements = await tx.stockMovement.findMany({
      where: {
        ...(billItemId ? { billItemId } : { hospitalRecordId }),
        productId,
        stockBatchId: { not: null },
        type: { in: [StockMovementType.VISIT_USAGE, StockMovementType.CORRECTION] },
      },
      orderBy: { createdAt: 'desc' },
      select: { stockBatchId: true, warehouseId: true, quantity: true, createdAt: true },
    });
    const byBatch = new Map<string, { stockBatchId: string; warehouseId: string | null; quantity: Prisma.Decimal; createdAt: Date }>();

    for (const movement of movements) {
      if (!movement.stockBatchId) continue;
      const item = byBatch.get(movement.stockBatchId) ?? {
        stockBatchId: movement.stockBatchId,
        warehouseId: movement.warehouseId,
        quantity: decimal(0),
        createdAt: movement.createdAt,
      };
      item.quantity = item.quantity.minus(movement.quantity);
      if (movement.createdAt > item.createdAt) item.createdAt = movement.createdAt;
      byBatch.set(movement.stockBatchId, item);
    }

    const restorable = [...byBatch.values()]
      .filter((item) => item.quantity.greaterThan(0))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    for (const item of restorable) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const quantity = item.quantity.lessThan(remaining) ? item.quantity : remaining;
      await tx.stockBatch.update({ where: { id: item.stockBatchId }, data: { rest: { increment: quantity } } });
      await tx.stockMovement.create({
        data: {
          productId,
          billItemId,
          hospitalRecordId,
          stockBatchId: item.stockBatchId,
          warehouseId: item.warehouseId,
          visitId,
          type: StockMovementType.CORRECTION,
          quantity,
          comment: `Возврат списания «${title}» по стационару`,
        },
      });
      remaining = remaining.minus(quantity);
    }

    if (remaining.greaterThan(0)) {
      throw new BadRequestException(`Не удалось полностью вернуть списание товара «${title}»`);
    }
  }

  private async getHospitalProductDeductedQuantity(
    tx: Prisma.TransactionClient,
    billItemId: string | null,
    hospitalRecordId: string,
    productId: string,
  ) {
    const movements = await tx.stockMovement.findMany({
      where: {
        ...(billItemId ? { billItemId } : { hospitalRecordId }),
        productId,
        type: { in: [StockMovementType.VISIT_USAGE, StockMovementType.CORRECTION] },
      },
      select: { quantity: true },
    });
    return maxDecimal(
      movements.reduce((sum, movement) => sum.minus(movement.quantity), decimal(0)),
      decimal(0),
    );
  }

  private async recalculateHospitalBill(tx: Prisma.TransactionClient, billId: string, visitId: string) {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: { items: true, payments: true },
    });
    if (!bill) throw new NotFoundException('Счёт стационара не найден');
    const totalAmount = bill.items.reduce((sum, item) => sum.plus(item.totalAmount), decimal(0));
    const paidAmount = bill.payments.reduce((sum, payment) => sum.plus(payment.amount), decimal(0));
    const status = resolvePaymentStatus(totalAmount, paidAmount);
    await tx.bill.update({ where: { id: billId }, data: { totalAmount, paidAmount, status } });
    await tx.visit.update({ where: { id: visitId }, data: { totalAmount } });
  }

  private async getWarehouseScope(employeeId: string): Promise<WarehouseScope> {
    const accesses = await this.prisma.employeeWarehouseAccess.findMany({
      where: { employeeId },
      select: { warehouseId: true },
    });
    return accesses.length ? accesses.map((access) => access.warehouseId) : null;
  }

  private ensureDirectRecordEditAllowed(recordedAt: Date, timeZone: string) {
    const recordDate = dateKeyInTimeZone(recordedAt, timeZone);
    const today = dateKeyInTimeZone(new Date(), timeZone);
    if (recordDate < today) {
      throw new BadRequestException('Прошлые сутки закрыты. Добавьте исправление с причиной — исходная запись останется в истории');
    }
  }

  private ensureRecordWithinStay(recordedAt: Date, startedAt: Date, completedAt: Date | null) {
    if (recordedAt.getTime() < startedAt.getTime() - 60_000) {
      throw new BadRequestException('Время записи не может быть раньше поступления в стационар');
    }
    if (completedAt && recordedAt.getTime() > completedAt.getTime() + 60_000) {
      throw new BadRequestException('Время записи не может быть позже выписки из стационара');
    }
  }

  private async getExistingHospitalStay(stayId: string) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { OR: [{ id: stayId }, { sourceVisitId: stayId }] },
      select: {
        id: true,
        sourceVisitId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        hospitalBox: { select: { office: { select: { timezone: true } } } },
      },
    });

    if (!stay) {
      throw new NotFoundException('Госпитализация не найдена');
    }

    return stay;
  }
}

const plannedCatalogSnapshotSelect = {
  plannedProductId: true,
  plannedServiceId: true,
  plannedQuantity: true,
  plannedStockQuantity: true,
  plannedUnitPrice: true,
} satisfies Prisma.HospitalRecordSelect;

const plannedCatalogAmendmentWhere = {
  OR: [
    { plannedProductId: { not: null } },
    { plannedServiceId: { not: null } },
    { plannedQuantity: { not: null } },
    { plannedStockQuantity: { not: null } },
    { plannedUnitPrice: { not: null } },
  ],
} satisfies Prisma.HospitalRecordWhereInput;

type PlannedCatalogSnapshot = {
  plannedProductId: string | null;
  plannedServiceId: string | null;
  plannedQuantity: Prisma.Decimal | null;
  plannedStockQuantity: Prisma.Decimal | null;
  plannedUnitPrice: Prisma.Decimal | null;
};

function getEffectivePlannedCatalog(
  record: PlannedCatalogSnapshot & { amendments?: PlannedCatalogSnapshot[] },
) {
  const correction = record.amendments?.[0];
  return {
    productId: correction?.plannedProductId ?? record.plannedProductId,
    serviceId: correction?.plannedServiceId ?? record.plannedServiceId,
    quantity: correction?.plannedQuantity ?? record.plannedQuantity,
    stockQuantity: correction?.plannedStockQuantity ?? record.plannedStockQuantity,
    unitPrice: correction?.plannedUnitPrice ?? record.plannedUnitPrice,
  };
}

const hospitalRecordBaseInclude = {
  recordedBy: { select: { id: true, fullName: true, position: true } },
  performedBy: { select: { id: true, fullName: true, position: true } },
  cancelledBy: { select: { id: true, fullName: true, position: true } },
  treatmentPlan: { select: { id: true, title: true } },
  plannedProduct: {
    select: {
      id: true,
      title: true,
      retailPrice: true,
      stockUnit: true,
      writeOffUnit: true,
      billingUnit: true,
      packageQuantity: true,
    },
  },
  plannedService: { select: servicePricingSelect },
  billItem: {
    select: {
      id: true,
      productId: true,
      serviceId: true,
      title: true,
      quantity: true,
      stockQuantity: true,
      unitPrice: true,
      discount: true,
      totalAmount: true,
      product: {
        select: {
          id: true,
          title: true,
          stockUnit: true,
          writeOffUnit: true,
          billingUnit: true,
          packageQuantity: true,
        },
      },
      service: { select: servicePricingSelect },
    },
  },
} satisfies Prisma.HospitalRecordInclude;

const hospitalRecordInclude = {
  ...hospitalRecordBaseInclude,
  amendments: {
    orderBy: { recordedAt: 'asc' as const },
    include: hospitalRecordBaseInclude,
  },
} satisfies Prisma.HospitalRecordInclude;

const hospitalStayInclude = {
  owner: { select: { id: true, fullName: true, phone: true, extraPhone: true } },
  animal: { select: { id: true, nickname: true, species: true, breed: true, sex: true, birthDate: true, status: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  hospitalBox: {
    select: {
      id: true,
      name: true,
      officeId: true,
      office: { select: { timezone: true } },
    },
  },
  sourceVisit: {
    include: {
      exam: true,
      recommendation: true,
      bill: { select: { id: true, status: true, totalAmount: true, paidAmount: true } },
      hospitalRecords: {
        where: { parentRecordId: null },
        orderBy: { recordedAt: 'desc' as const },
        include: hospitalRecordInclude,
      },
    },
  },
} satisfies Prisma.HospitalStayInclude;

type HospitalStayWithRelations = Prisma.HospitalStayGetPayload<{ include: typeof hospitalStayInclude }>;

function serializeHospitalStay(stay: HospitalStayWithRelations) {
  return {
    id: stay.id,
    sourceVisitId: stay.sourceVisitId,
    ownerId: stay.ownerId,
    animalId: stay.animalId,
    employeeId: stay.employeeId,
    hospitalBoxId: stay.hospitalBoxId,
    status: stay.status,
    purpose: stay.purpose,
    startedAt: stay.startedAt,
    completedAt: stay.completedAt,
    createdAt: stay.createdAt,
    updatedAt: stay.updatedAt,
    totalAmount: stay.sourceVisit.totalAmount,
    owner: stay.owner,
    animal: stay.animal,
    employee: stay.employee,
    hospitalBox: {
      id: stay.hospitalBox.id,
      name: stay.hospitalBox.name,
      officeId: stay.hospitalBox.officeId,
    },
    timezone: stay.hospitalBox.office.timezone,
    exam: stay.sourceVisit.exam,
    recommendation: stay.sourceVisit.recommendation,
    bill: stay.sourceVisit.bill,
    hospitalRecords: stay.sourceVisit.hospitalRecords.map((record) => ({
      ...record,
      canEditDirectly: stay.status === HospitalStayStatus.ACTIVE
        && dateKeyInTimeZone(record.recordedAt, stay.hospitalBox.office.timezone) >= dateKeyInTimeZone(new Date(), stay.hospitalBox.office.timezone),
      editRule: dateKeyInTimeZone(record.recordedAt, stay.hospitalBox.office.timezone) < dateKeyInTimeZone(new Date(), stay.hospitalBox.office.timezone)
        ? 'AMENDMENT_REQUIRED'
        : stay.status === HospitalStayStatus.ACTIVE ? 'DIRECT' : 'AMENDMENT_REQUIRED',
    })),
  };
}

function dateKeyInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function calculateCatalogLine(input: {
  serviceId?: string;
  productId?: string;
  title?: string;
  quantity?: Prisma.Decimal.Value;
  stockQuantity?: Prisma.Decimal.Value;
  unitPrice?: Prisma.Decimal.Value;
}) {
  const title = input.title?.trim();
  if (!title) throw new BadRequestException('Не удалось определить название товара или услуги');
  const quantity = decimal(input.quantity ?? 1);
  const stockQuantity = input.productId ? decimal(input.stockQuantity ?? input.quantity ?? 1) : null;
  const unitPrice = decimal(input.unitPrice ?? 0);
  return {
    serviceId: input.serviceId,
    productId: input.productId,
    title,
    quantity,
    stockQuantity,
    unitPrice,
    totalAmount: maxDecimal(quantity.mul(unitPrice), decimal(0)),
  };
}

function hasHospitalBillingChanged(
  billItem: { quantity: Prisma.Decimal | null; stockQuantity: Prisma.Decimal | null; unitPrice: Prisma.Decimal | null } | null,
  dto: UpdateHospitalRecordDto,
) {
  if (!billItem) {
    return dto.quantity !== undefined || dto.stockQuantity !== undefined || dto.unitPrice !== undefined;
  }
  return (dto.quantity !== undefined && (billItem.quantity === null || !billItem.quantity.equals(dto.quantity)))
    || (dto.stockQuantity !== undefined && (billItem.stockQuantity === null || !billItem.stockQuantity.equals(dto.stockQuantity)))
    || (dto.unitPrice !== undefined && (billItem.unitPrice === null || !billItem.unitPrice.equals(dto.unitPrice)));
}

type HospitalCatalogLine = ReturnType<typeof calculateCatalogLine>;

function compareStockBatches(
  left: { expiresAt: Date | null; createdAt: Date },
  right: { expiresAt: Date | null; createdAt: Date },
) {
  if (left.expiresAt && right.expiresAt && left.expiresAt.getTime() !== right.expiresAt.getTime()) {
    return left.expiresAt.getTime() - right.expiresAt.getTime();
  }
  if (left.expiresAt && !right.expiresAt) return -1;
  if (!left.expiresAt && right.expiresAt) return 1;
  return left.createdAt.getTime() - right.createdAt.getTime();
}

function resolvePaymentStatus(totalAmount: Prisma.Decimal, paidAmount: Prisma.Decimal) {
  if (paidAmount.greaterThanOrEqualTo(totalAmount) && totalAmount.greaterThan(0)) return PaymentStatus.PAID;
  if (paidAmount.greaterThan(0)) return PaymentStatus.PARTIAL;
  return PaymentStatus.UNPAID;
}

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function decimalToNumber(value: Prisma.Decimal.Value) {
  return decimal(value).toNumber();
}

function decimalToOptionalNumber(value: Prisma.Decimal | null) {
  return value === null ? undefined : value.toNumber();
}

function maxDecimal(left: Prisma.Decimal, right: Prisma.Decimal) {
  return left.lessThan(right) ? right : left;
}

function cleanOrNull(value: string) {
  return value.trim() || null;
}
