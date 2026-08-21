import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  BillSource,
  LaboratoryOrderItemStatus,
  LaboratoryOrderStatus,
  PaymentStatus,
  Prisma,
  QueueStatus,
  StockMovementType,
  VisitStatus,
  VisitType,
} from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { rankSearchResults, withRussianSearchVariants } from '../../common/search-ranking';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { FinanceService } from '../finance/finance.service';
import { MedicalPhrasesService } from '../medical-phrases/medical-phrases.service';
import { OwnerGatewaySnapshotSyncService } from '../notifications/owner-gateway-snapshot-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AddVisitServiceDto } from './dto/add-visit-service.dto';
import { AddVisitServicesDto } from './dto/add-visit-services.dto';
import { CreateVisitLaboratoryOrderDto } from './dto/create-visit-laboratory-order.dto';
import { CreateVisitDiagnosisDto } from './dto/create-visit-diagnosis.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { ListVisitsQueryDto } from './dto/list-visits-query.dto';
import { ListVisitCatalogQueryDto } from './dto/list-visit-catalog-query.dto';
import { RestoreVisitDto } from './dto/restore-visit.dto';
import { UpdateVisitDiagnosisDto } from './dto/update-visit-diagnosis.dto';
import { UpdateVisitLaboratoryItemDto } from './dto/update-visit-laboratory-item.dto';
import { UpdateVisitServiceDto } from './dto/update-visit-service.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { UpsertVisitExamDto } from './dto/upsert-visit-exam.dto';
import { UpsertVisitRecommendationDto } from './dto/upsert-visit-recommendation.dto';
import { toStockQuantity } from '../stock/stock-units';
import { resolveServiceUnitPrice, servicePricingSelect } from '../stock/service-pricing';
import { extractLaboratoryDocumentIndicators, LaboratoryFormSnapshot } from '../laboratory/laboratory-document-form';
import { assertPrimaryVisitDiagnosesReady } from './visit-diagnosis-rules';

type WarehouseScope = string[] | null;
const COMPLETED_VISIT_EDIT_GRACE_MS = 30 * 60 * 1000;

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
    private readonly financeService: FinanceService,
    private readonly medicalPhrasesService: MedicalPhrasesService,
    private readonly ownerGatewaySnapshotSyncService: OwnerGatewaySnapshotSyncService,
  ) {}

  async listVisits(query: ListVisitsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.VisitWhereInput = {
      ...(query.excludeHospital === 'true' ? { hospitalBoxId: null } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            startedAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: withRussianSearchVariants(search, (variant) => [
              { owner: { fullName: { contains: variant, mode: 'insensitive' as const } } },
              { owner: { phone: { contains: variant, mode: 'insensitive' as const } } },
              { animal: { nickname: { contains: variant, mode: 'insensitive' as const } } },
              { employee: { fullName: { contains: variant, mode: 'insensitive' as const } } },
              { exam: { purpose: { contains: variant, mode: 'insensitive' as const } } },
              { exam: { anamnesis: { contains: variant, mode: 'insensitive' as const } } },
              { exam: { examination: { contains: variant, mode: 'insensitive' as const } } },
              { recommendation: { treatmentPlan: { contains: variant, mode: 'insensitive' as const } } },
              { diagnoses: { some: { title: { contains: variant, mode: 'insensitive' as const } } } },
            ]),
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        include: visitListInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async listClinicalCatalog(query: ListVisitCatalogQueryDto, actorId: string) {
    const search = query.search?.trim();
    const warehouseScope = await this.getWarehouseScope(actorId);
    const [products, services] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          ...(search ? {
            OR: withRussianSearchVariants(search, (variant) => [
              { title: { contains: variant, mode: 'insensitive' as const } },
              { sku: { contains: variant, mode: 'insensitive' as const } },
              { gtin: { contains: variant, mode: 'insensitive' as const } },
              { barcode: { contains: variant, mode: 'insensitive' as const } },
              { barcodes: { some: { value: { contains: variant, mode: 'insensitive' as const } } } },
            ]),
          } : {}),
        },
        orderBy: { title: 'asc' },
        take: search ? 200 : 50,
        select: {
          id: true,
          isActive: true,
          title: true,
          sku: true,
          gtin: true,
          barcode: true,
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
        where: {
          isActive: true,
          ...(search ? { OR: withRussianSearchVariants(search, (variant) => [{ title: { contains: variant, mode: 'insensitive' as const } }]) } : {}),
        },
        orderBy: { title: 'asc' },
        take: search ? 200 : 50,
        select: {
          id: true,
          isActive: true,
          title: true,
          price: true,
          priceType: true,
          minimumPrice: true,
          maximumPrice: true,
        },
      }),
    ]);

    return {
      products: rankSearchResults(products, search, (product) => [product.title]).slice(0, 50).map(({ batches, ...product }) => ({
        ...product,
        stockRest: batches.reduce((sum, batch) => sum.plus(batch.rest), decimal(0)),
      })),
      services: rankSearchResults(services, search, (service) => [service.title]).slice(0, 50),
    };
  }

  async createVisit(dto: CreateVisitDto, actor: AuthEmployee) {
    const data = await this.resolveVisitCreationData(dto, actor);
    const dueAt = await this.financeService.getDefaultBillDueAt();

    const visit = await this.prisma.$transaction(async (tx) => {
      const createdVisit = await tx.visit.create({
        data: {
          ownerId: data.ownerId,
          animalId: data.animalId,
          employeeId: data.employeeId,
          appointmentId: data.appointmentId,
          queueEntryId: data.queueEntryId,
          hospitalBoxId: data.hospitalBoxId,
          visitType: data.visitType,
          status: data.status,
          startedAt: data.startedAt,
        },
      });

      await tx.bill.create({
        data: {
          ownerId: data.ownerId,
          animalId: data.animalId,
          visitId: createdVisit.id,
          source: BillSource.VISIT,
          status: PaymentStatus.UNPAID,
          dueAt,
        },
      });

      await this.syncVisitSourceStatus(tx, createdVisit, data.status);

      return createdVisit;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit.create',
      entityType: 'Visit',
      entityId: visit.id,
      metadata: {
        ownerId: data.ownerId,
        animalId: data.animalId,
        employeeId: data.employeeId,
        appointmentId: data.appointmentId,
        queueEntryId: data.queueEntryId,
        status: data.status,
      },
    });

    return this.getVisit(visit.id);
  }

  async getVisit(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: visitInclude,
    });

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    return visit;
  }

  async updateVisit(visitId: string, dto: UpdateVisitDto, actor: AuthEmployee) {
    const existing = await this.getExistingVisit(visitId);
    ensureVisitEditable(existing, actor);

    if (existing.status === VisitStatus.CANCELLED && dto.status && dto.status !== VisitStatus.CANCELLED) {
      throw new BadRequestException('Сначала верните отменённый приём в работу и укажите причину');
    }

    if (dto.status === VisitStatus.COMPLETED) {
      await this.ensurePrimaryVisitDiagnosesReady({
        ...existing,
        visitType: dto.visitType ?? existing.visitType,
      });
    }

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
    }

    if (dto.hospitalBoxId) {
      await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);
    }

    const statusData = resolveVisitStatusData(dto.status, existing);

    const visit = await this.prisma.$transaction(async (tx) => {
      if (dto.status === VisitStatus.CANCELLED) {
        await this.cancelUnpaidVisitBill(tx, visitId);
      }
      const updatedVisit = await tx.visit.update({
        where: { id: visitId },
        data: {
          ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
          ...(dto.hospitalBoxId !== undefined ? { hospitalBoxId: dto.hospitalBoxId } : {}),
          ...(dto.visitType !== undefined ? { visitType: dto.visitType } : {}),
          ...statusData,
        },
      });

      if (dto.status) {
        await this.syncVisitSourceStatus(tx, updatedVisit, dto.status);
        if (isPortalSnapshotStatus(dto.status)) {
          await this.ownerGatewaySnapshotSyncService.enqueue({
            ownerId: existing.ownerId,
            visitId,
            visitStatus: dto.status,
            actorId: actor.id,
          }, tx);
        }
      }

      return updatedVisit;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit.update',
      entityType: 'Visit',
      entityId: visit.id,
      metadata: { changedFields: Object.keys(dto), status: visit.status },
    });

    if (dto.status && isPortalSnapshotStatus(dto.status)) {
      void this.ownerGatewaySnapshotSyncService.syncNow();
    }

    return this.getVisit(visit.id);
  }

  async startVisit(visitId: string, actor: AuthEmployee) {
    return this.setStatus(visitId, VisitStatus.IN_PROGRESS, actor, 'visit.start');
  }

  async completeVisit(visitId: string, actor: AuthEmployee) {
    return this.setStatus(visitId, VisitStatus.COMPLETED, actor, 'visit.complete');
  }

  async cancelVisit(visitId: string, actor: AuthEmployee) {
    return this.setStatus(visitId, VisitStatus.CANCELLED, actor, 'visit.cancel');
  }

  async restoreVisit(visitId: string, dto: RestoreVisitDto, actor: AuthEmployee) {
    if (!actor.roles.includes('director')) {
      throw new BadRequestException('Вернуть отменённый приём в работу может только директор');
    }

    const existing = await this.getExistingVisit(visitId);
    if (existing.status !== VisitStatus.CANCELLED) {
      throw new BadRequestException('В работу можно вернуть только отменённый приём');
    }

    const reason = dto.reason.trim();
    const visit = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Visit" WHERE "id" = ${visitId} FOR UPDATE`;
      await this.reopenCancelledVisitBill(tx, visitId);
      const updatedVisit = await tx.visit.update({
        where: { id: visitId },
        data: resolveVisitStatusData(VisitStatus.IN_PROGRESS, existing),
      });
      await this.syncVisitSourceStatus(tx, updatedVisit, VisitStatus.IN_PROGRESS);
      return updatedVisit;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit.restore',
      entityType: 'Visit',
      entityId: visit.id,
      metadata: { previousStatus: VisitStatus.CANCELLED, status: VisitStatus.IN_PROGRESS, reason },
    });

    return this.getVisit(visit.id);
  }

  async upsertExam(visitId: string, dto: UpsertVisitExamDto, actor: AuthEmployee) {
    const visit = await this.getExistingVisit(visitId);
    ensureVisitEditable(visit, actor);
    await this.ensurePrimaryVisitDiagnosesReady(visit);

    const exam = await this.prisma.$transaction(async (tx) => {
      const savedExam = await tx.visitExam.upsert({
        where: { visitId },
        create: {
          visitId,
          purpose: dto.purpose,
          anamnesis: dto.anamnesis,
          examination: dto.examination,
          symptoms: dto.symptoms,
          manipulations: dto.manipulations,
          weightKg: dto.weightKg,
          temperatureC: dto.temperatureC,
          comment: dto.comment,
        },
        update: {
          ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
          ...(dto.anamnesis !== undefined ? { anamnesis: dto.anamnesis } : {}),
          ...(dto.examination !== undefined ? { examination: dto.examination } : {}),
          ...(dto.symptoms !== undefined ? { symptoms: dto.symptoms } : {}),
          ...(dto.manipulations !== undefined ? { manipulations: dto.manipulations } : {}),
          ...(dto.weightKg !== undefined ? { weightKg: dto.weightKg } : {}),
          ...(dto.temperatureC !== undefined ? { temperatureC: dto.temperatureC } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        },
      });

      if (dto.weightKg !== undefined) {
        await tx.animalWeightRecord.create({
          data: {
            animalId: visit.animalId,
            weightKg: dto.weightKg,
            measuredAt: new Date(),
          },
        });
      }

      return savedExam;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_exam.upsert',
      entityType: 'Visit',
      entityId: visitId,
      metadata: { changedFields: Object.keys(dto), weightRecorded: dto.weightKg !== undefined },
    });

    await this.medicalPhrasesService.learnFromText(
      {
        'visit.exam.purpose': dto.purpose,
        'visit.exam.anamnesis': dto.anamnesis,
        'visit.exam.examination': dto.examination,
        'visit.exam.symptoms': dto.symptoms,
        'visit.exam.manipulations': dto.manipulations,
        'visit.exam.comment': dto.comment,
      },
      actor,
    );

    await this.syncCompletedVisitSnapshot(visit, actor.id);

    return exam;
  }

  async upsertRecommendation(visitId: string, dto: UpsertVisitRecommendationDto, actor: AuthEmployee) {
    const visit = await this.getExistingVisit(visitId);
    ensureVisitEditable(visit, actor);

    const recommendation = await this.prisma.visitRecommendation.upsert({
      where: { visitId },
      create: {
        visitId,
        treatmentPlan: dto.treatmentPlan,
        careNotes: dto.careNotes,
      },
      update: {
        ...(dto.treatmentPlan !== undefined ? { treatmentPlan: dto.treatmentPlan } : {}),
        ...(dto.careNotes !== undefined ? { careNotes: dto.careNotes } : {}),
      },
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_recommendation.upsert',
      entityType: 'Visit',
      entityId: visitId,
      metadata: { changedFields: Object.keys(dto) },
    });

    await this.medicalPhrasesService.learnFromText(
      {
        'visit.recommendation.treatmentPlan': dto.treatmentPlan,
        'visit.recommendation.careNotes': dto.careNotes,
      },
      actor,
    );

    await this.syncCompletedVisitSnapshot(visit, actor.id);

    return recommendation;
  }

  async createDiagnosis(visitId: string, dto: CreateVisitDiagnosisDto, actor: AuthEmployee) {
    const visit = await this.getExistingVisit(visitId);
    ensureVisitEditable(visit, actor);

    const diagnosis = await this.prisma.visitDiagnosis.create({
      data: {
        visitId,
        title: dto.title,
        diagnosisType: dto.diagnosisType,
        description: dto.description,
        status: dto.status,
      },
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_diagnosis.create',
      entityType: 'VisitDiagnosis',
      entityId: diagnosis.id,
      metadata: { visitId },
    });

    await this.syncCompletedVisitSnapshot(visit, actor.id);

    return diagnosis;
  }

  async updateDiagnosis(visitId: string, diagnosisId: string, dto: UpdateVisitDiagnosisDto, actor: AuthEmployee) {
    const visit = await this.getExistingVisit(visitId);
    ensureVisitEditable(visit, actor);
    await this.ensureDiagnosisBelongsToVisit(visitId, diagnosisId);

    const diagnosis = await this.prisma.visitDiagnosis.update({
      where: { id: diagnosisId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.diagnosisType !== undefined ? { diagnosisType: dto.diagnosisType } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_diagnosis.update',
      entityType: 'VisitDiagnosis',
      entityId: diagnosis.id,
      metadata: { visitId, changedFields: Object.keys(dto) },
    });

    await this.syncCompletedVisitSnapshot(visit, actor.id);

    return diagnosis;
  }

  async deleteDiagnosis(visitId: string, diagnosisId: string, actor: AuthEmployee) {
    const visit = await this.getExistingVisit(visitId);
    ensureVisitEditable(visit, actor);
    await this.ensureDiagnosisBelongsToVisit(visitId, diagnosisId);

    await this.prisma.visitDiagnosis.delete({ where: { id: diagnosisId } });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_diagnosis.delete',
      entityType: 'VisitDiagnosis',
      entityId: diagnosisId,
      metadata: { visitId },
    });

    await this.syncCompletedVisitSnapshot(visit, actor.id);

    return { deleted: true };
  }

  async addService(visitId: string, dto: AddVisitServiceDto, actor: AuthEmployee) {
    const serviceLine = await this.resolveServiceLine(dto);

    const billItem = await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      ensureVisitEditable(visit, actor);
      ensureVisitOperational(visit);
      const bill = await this.getOrCreateVisitBill(tx, visit);
      const createdBillItem = await tx.billItem.create({
        data: {
          billId: bill.id,
          serviceId: serviceLine.serviceId,
          productId: serviceLine.productId,
          title: serviceLine.title,
          quantity: serviceLine.quantity,
          stockQuantity: serviceLine.stockQuantity,
          unitPrice: serviceLine.unitPrice,
          discount: serviceLine.discount,
          totalAmount: serviceLine.totalAmount,
        },
      });

      await this.recalculateVisitTotals(tx, visitId);

      return createdBillItem;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_service.add',
      entityType: 'BillItem',
      entityId: billItem.id,
      metadata: { visitId, title: billItem.title, totalAmount: billItem.totalAmount },
    });

    return billItem;
  }

  async addServices(visitId: string, dto: AddVisitServicesDto, actor: AuthEmployee) {
    const serviceLines = await Promise.all(dto.items.map((item) => this.resolveServiceLine(item)));
    const billItems = await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      ensureVisitEditable(visit, actor);
      ensureVisitOperational(visit);
      const bill = await this.getOrCreateVisitBill(tx, visit);
      const created = [];
      for (const serviceLine of serviceLines) {
        created.push(await tx.billItem.create({
          data: {
            billId: bill.id,
            serviceId: serviceLine.serviceId,
            productId: serviceLine.productId,
            title: serviceLine.title,
            quantity: serviceLine.quantity,
            stockQuantity: serviceLine.stockQuantity,
            unitPrice: serviceLine.unitPrice,
            discount: serviceLine.discount,
            totalAmount: serviceLine.totalAmount,
          },
        }));
      }
      await this.recalculateVisitTotals(tx, visitId);
      return created;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_service.bulk_add',
      entityType: 'Visit',
      entityId: visitId,
      metadata: {
        count: billItems.length,
        billItemIds: billItems.map((item) => item.id),
        titles: billItems.map((item) => item.title),
      },
    });

    return { items: billItems, count: billItems.length };
  }

  async updateService(visitId: string, billItemId: string, dto: UpdateVisitServiceDto, actor: AuthEmployee) {
    const billItem = await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      ensureVisitEditable(visit, actor);
      ensureVisitOperational(visit);
      const existingBillItem = await this.getVisitBillItem(tx, visitId, billItemId);
      ensureVisitBillItemEditable(existingBillItem.bill);
      await this.restoreCurrentVisitProductWriteOff(tx, visitId, existingBillItem);
      const serviceUnitPrice = existingBillItem.serviceId && dto.unitPrice !== undefined
        ? resolveServiceUnitPrice(
            await tx.service.findUniqueOrThrow({ where: { id: existingBillItem.serviceId }, select: servicePricingSelect }),
            dto.unitPrice,
          )
        : dto.unitPrice;
      const line = resolveBillItemLine({
        serviceId: existingBillItem.serviceId ?? undefined,
        productId: existingBillItem.productId ?? undefined,
        title: dto.title ?? existingBillItem.title,
        quantity: dto.quantity ?? decimalToNumber(existingBillItem.quantity),
        stockQuantity:
          dto.stockQuantity ??
          (existingBillItem.stockQuantity === null ? decimalToNumber(existingBillItem.quantity) : decimalToNumber(existingBillItem.stockQuantity)),
        unitPrice: serviceUnitPrice ?? decimalToNumber(existingBillItem.unitPrice),
        discount: dto.discount ?? decimalToNumber(existingBillItem.discount),
      });

      const updatedBillItem = await tx.billItem.update({
        where: { id: billItemId },
        data: {
          title: line.title,
          quantity: line.quantity,
          stockQuantity: line.stockQuantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          totalAmount: line.totalAmount,
        },
      });

      await this.recalculateVisitTotals(tx, visitId);

      return updatedBillItem;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_service.update',
      entityType: 'BillItem',
      entityId: billItem.id,
      metadata: { visitId, changedFields: Object.keys(dto), totalAmount: billItem.totalAmount },
    });

    return billItem;
  }

  async deleteService(visitId: string, billItemId: string, actor: AuthEmployee) {
    await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      ensureVisitEditable(visit, actor);
      ensureVisitOperational(visit);
      const billItem = await this.getVisitBillItem(tx, visitId, billItemId);
      ensureVisitBillItemEditable(billItem.bill);
      await this.restoreCurrentVisitProductWriteOff(tx, visitId, billItem);
      await tx.billItem.delete({ where: { id: billItemId } });
      await this.recalculateVisitTotals(tx, visitId);
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_service.delete',
      entityType: 'BillItem',
      entityId: billItemId,
      metadata: { visitId },
    });

    return { deleted: true };
  }

  async createLaboratoryOrder(visitId: string, dto: CreateVisitLaboratoryOrderDto, actor: AuthEmployee) {
    const testIds = uniqueIds(dto.testIds);
    const profileIds = uniqueIds(dto.profileIds);

    if (!testIds.length && !profileIds.length) {
      throw new BadRequestException('Выберите анализ или профиль анализов');
    }

    const [tests, profiles] = await this.prisma.$transaction([
      this.prisma.laboratoryTest.findMany({
        where: { id: { in: testIds }, isActive: true },
        include: {
          service: laboratoryServiceSelect,
          documentTemplate: { select: { id: true, title: true, currentVersion: true, layout: true } },
        },
      }),
      this.prisma.laboratoryProfile.findMany({
        where: { id: { in: profileIds }, isActive: true },
        include: {
          service: laboratoryServiceSelect,
          tests: {
            orderBy: { sortOrder: 'asc' },
            include: { test: { include: { service: laboratoryServiceSelect } } },
          },
        },
      }),
    ]);

    if (tests.length !== testIds.length) {
      throw new NotFoundException('Один или несколько анализов не найдены или выключены');
    }
    const unconfiguredTest = tests.find((test) => {
      if (!test.service || !test.documentTemplate) return true;
      return extractLaboratoryDocumentIndicators(test.documentTemplate.layout).indicators.length === 0;
    });
    if (unconfiguredTest) {
      throw new BadRequestException(`Анализ «${unconfiguredTest.title}» нельзя назначить: привяжите к нему платную услугу и документ с таблицей показателей`);
    }

    if (profiles.length !== profileIds.length) {
      throw new NotFoundException('Один или несколько профилей не найдены или выключены');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      ensureVisitEditable(visit, actor);
      ensureVisitOperational(visit);
      const bill = await this.getOrCreateVisitBill(tx, visit);
      const createdOrder = await tx.laboratoryOrder.create({
        data: {
          visitId,
          createdById: actor.id,
          comment: clean(dto.comment),
        },
      });
      const formSnapshots: LaboratoryFormSnapshot[] = [];

      for (const test of tests) {
        const billItemId = await createBillItemFromService(tx, bill.id, test.service);
        const { layout, indicators } = extractLaboratoryDocumentIndicators(test.documentTemplate?.layout);

        if (test.documentTemplate && layout && indicators.length) {
          const bindings: LaboratoryFormSnapshot['bindings'] = [];
          for (const [index, indicator] of indicators.entries()) {
            const item = await tx.laboratoryOrderItem.create({
              data: {
                ...toLaboratoryOrderItemData(createdOrder.id, test, null, index === 0 ? billItemId : null),
                title: indicator.title,
                code: indicator.code,
                groupName: test.title,
                unit: indicator.unit,
                referenceRange: indicator.referenceRange,
              },
              select: { id: true },
            });
            bindings.push({
              itemId: item.id,
              blockId: indicator.blockId,
              rowIndex: indicator.rowIndex,
              resultColumnIndex: indicator.resultColumnIndex,
            });
          }

          formSnapshots.push({
            schemaVersion: 1,
            testId: test.id,
            testTitle: test.title,
            documentTemplateId: test.documentTemplate.id,
            documentTemplateTitle: test.documentTemplate.title,
            documentTemplateVersion: test.documentTemplate.currentVersion,
            layout,
            bindings,
          });
        } else {
          await tx.laboratoryOrderItem.create({
            data: toLaboratoryOrderItemData(createdOrder.id, test, null, billItemId),
          });
        }
      }

      for (const profile of profiles) {
        const profileBillItemId = await createBillItemFromService(tx, bill.id, profile.service);

        if (!profile.tests.length) {
          await tx.laboratoryOrderItem.create({
            data: {
              orderId: createdOrder.id,
              profileId: profile.id,
              billItemId: profileBillItemId,
              title: profile.title,
              code: profile.code,
            },
          });
          continue;
        }

        for (const link of profile.tests) {
          const billItemId = profileBillItemId ?? (await createBillItemFromService(tx, bill.id, link.test.service));
          await tx.laboratoryOrderItem.create({
            data: toLaboratoryOrderItemData(createdOrder.id, link.test, profile.id, billItemId),
          });
        }
      }

      if (formSnapshots.length) {
        await tx.laboratoryOrder.update({
          where: { id: createdOrder.id },
          data: { formSnapshots: formSnapshots as unknown as Prisma.InputJsonValue },
        });
      }

      await this.recalculateVisitTotals(tx, visitId);
      return tx.laboratoryOrder.findUniqueOrThrow({
        where: { id: createdOrder.id },
        include: laboratoryOrderInclude,
      });
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_laboratory_order.create',
      entityType: 'LaboratoryOrder',
      entityId: order.id,
      metadata: {
        visitId,
        items: order.items.length,
        testIds,
        profileIds,
        linkedDocumentForms: Array.isArray(order.formSnapshots) ? order.formSnapshots.length : 0,
      },
    });

    return this.getVisit(visitId);
  }

  async updateLaboratoryOrderItem(
    visitId: string,
    orderId: string,
    itemId: string,
    dto: UpdateVisitLaboratoryItemDto,
    actor: AuthEmployee,
  ) {
    const item = await this.prisma.$transaction(async (tx) => {
      const existingItem = await tx.laboratoryOrderItem.findFirst({
        where: { id: itemId, orderId, order: { visitId } },
        include: { order: { select: { status: true, visit: { select: { status: true, completedAt: true } } } } },
      });

      if (!existingItem) {
        throw new NotFoundException('Строка лабораторного заказа не найдена');
      }

      if (existingItem.order.status === LaboratoryOrderStatus.CANCELLED) {
        throw new BadRequestException('Отменённый лабораторный заказ нельзя редактировать');
      }

      ensureVisitEditable(existingItem.order.visit, actor);
      ensureVisitOperational(existingItem.order.visit);

      const updatedItem = await tx.laboratoryOrderItem.update({
        where: { id: itemId },
        data: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.resultValue !== undefined ? { resultValue: clean(dto.resultValue) } : {}),
          ...(dto.resultText !== undefined ? { resultText: clean(dto.resultText) } : {}),
          ...(dto.unit !== undefined ? { unit: clean(dto.unit) } : {}),
          ...(dto.referenceRange !== undefined ? { referenceRange: clean(dto.referenceRange) } : {}),
          ...(dto.comment !== undefined ? { comment: clean(dto.comment) } : {}),
          ...(dto.status === LaboratoryOrderItemStatus.COMPLETED ? { completedAt: new Date() } : {}),
          ...(dto.status !== undefined && dto.status !== LaboratoryOrderItemStatus.COMPLETED ? { completedAt: null } : {}),
        },
      });

      await this.syncLaboratoryOrderStatus(tx, orderId);
      return updatedItem;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_laboratory_order_item.update',
      entityType: 'LaboratoryOrderItem',
      entityId: item.id,
      metadata: { visitId, orderId, changedFields: Object.keys(dto), status: item.status },
    });

    return this.getVisit(visitId);
  }

  async cancelLaboratoryOrder(visitId: string, orderId: string, actor: AuthEmployee) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.laboratoryOrder.findFirst({
        where: { id: orderId, visitId },
        include: { items: true, visit: { select: { status: true, completedAt: true } } },
      });

      if (!order) {
        throw new NotFoundException('Лабораторный заказ не найден');
      }

      ensureVisitEditable(order.visit, actor);

      const bill = await tx.bill.findFirst({ where: { visitId }, select: { paidAmount: true } });
      if (bill && decimal(bill.paidAmount).greaterThan(0)) {
        throw new BadRequestException('Нельзя отменить лабораторный заказ после оплаты счёта');
      }

      const billItemIds = [...new Set(order.items.map((item) => item.billItemId).filter(Boolean))] as string[];
      await tx.laboratoryOrderItem.updateMany({
        where: { orderId },
        data: { status: LaboratoryOrderItemStatus.CANCELLED, completedAt: null },
      });
      await tx.laboratoryOrder.update({
        where: { id: orderId },
        data: { status: LaboratoryOrderStatus.CANCELLED, completedAt: null },
      });

      if (billItemIds.length) {
        await tx.billItem.deleteMany({ where: { id: { in: billItemIds } } });
      }

      await this.recalculateVisitTotals(tx, visitId);
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'visit_laboratory_order.cancel',
      entityType: 'LaboratoryOrder',
      entityId: orderId,
      metadata: { visitId },
    });

    return this.getVisit(visitId);
  }

  private async setStatus(visitId: string, status: VisitStatus, actor: AuthEmployee, action: string) {
    const existing = await this.getExistingVisit(visitId);
    ensureVisitEditable(existing, actor);

    if (existing.status === VisitStatus.CANCELLED && status !== VisitStatus.CANCELLED) {
      throw new BadRequestException('Сначала верните отменённый приём в работу и укажите причину');
    }

    if (status === VisitStatus.COMPLETED) {
      await this.ensurePrimaryVisitDiagnosesReady(existing);
    }

    const visit = await this.prisma.$transaction(async (tx) => {
      if (status === VisitStatus.CANCELLED) {
        await this.cancelUnpaidVisitBill(tx, visitId);
      }
      const updatedVisit = await tx.visit.update({
        where: { id: visitId },
        data: resolveVisitStatusData(status, existing),
      });

      await this.syncVisitSourceStatus(tx, updatedVisit, status);

      if (isPortalSnapshotStatus(status)) {
        await this.ownerGatewaySnapshotSyncService.enqueue({
          ownerId: existing.ownerId,
          visitId,
          visitStatus: status,
          actorId: actor.id,
        }, tx);
      }

      return updatedVisit;
    });

    await this.auditService.log({
      actorId: actor.id,
      action,
      entityType: 'Visit',
      entityId: visit.id,
      metadata: { status },
    });

    if (isPortalSnapshotStatus(status)) {
      void this.ownerGatewaySnapshotSyncService.syncNow();
    }

    return this.getVisit(visit.id);
  }

  private async ensurePrimaryVisitDiagnosesReady(visit: Pick<ExistingVisit, 'id' | 'visitType'>) {
    const diagnoses = await this.prisma.visitDiagnosis.findMany({
      where: { visitId: visit.id },
      select: { diagnosisType: true },
    });

    assertPrimaryVisitDiagnosesReady(visit, diagnoses);
  }

  private async resolveVisitCreationData(dto: CreateVisitDto, actor: AuthEmployee): Promise<VisitCreationData> {
    if (dto.appointmentId && dto.queueEntryId) {
      throw new BadRequestException('Visit can be linked to appointment or queue entry, not both');
    }

    let ownerId = dto.ownerId;
    let animalId = dto.animalId;
    let employeeId = dto.employeeId;
    let visitType = dto.visitType;

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        select: { ownerId: true, animalId: true, employeeId: true, visit: { select: { id: true } } },
      });

      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }

      if (appointment.visit) {
        throw new BadRequestException('Appointment already has a visit');
      }

      ownerId = appointment.ownerId;
      animalId = appointment.animalId;
      employeeId = employeeId ?? appointment.employeeId ?? actor.id;
    }

    if (dto.queueEntryId) {
      const queueEntry = await this.prisma.queueEntry.findUnique({
        where: { id: dto.queueEntryId },
        select: { ownerId: true, animalId: true, employeeId: true, visitType: true, isVaccination: true, visit: { select: { id: true } } },
      });

      if (!queueEntry) {
        throw new NotFoundException('Queue entry not found');
      }

      if (queueEntry.visit) {
        throw new BadRequestException('Queue entry already has a visit');
      }

      if (queueEntry.isVaccination) {
        throw new BadRequestException('Для этой очереди откройте карточку вакцинации пациента; обычный приём создавать не нужно');
      }

      if (!queueEntry.ownerId || !queueEntry.animalId) {
        throw new BadRequestException('Queue entry must be linked to existing owner and animal before visit');
      }

      ownerId = queueEntry.ownerId;
      animalId = queueEntry.animalId;
      employeeId = employeeId ?? queueEntry.employeeId ?? actor.id;
      visitType = visitType ?? queueEntry.visitType ?? undefined;
    }

    if (!ownerId || !animalId) {
      throw new BadRequestException('Visit must have owner and animal');
    }

    const status = dto.status ?? VisitStatus.IN_PROGRESS;

    if (status === VisitStatus.COMPLETED || status === VisitStatus.CANCELLED) {
      throw new BadRequestException('Visit can be created only as draft or in progress');
    }

    await this.schedulingService.ensureOwnerExists(ownerId);
    ownerId = await this.schedulingService.resolveAnimalOwner(animalId, ownerId);

    employeeId = employeeId ?? actor.id;
    await this.schedulingService.ensureEmployeeActive(employeeId);

    if (dto.hospitalBoxId) {
      await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);
    }

    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();

    if (Number.isNaN(startedAt.getTime())) {
      throw new BadRequestException('Visit must have valid start time');
    }

    return {
      ownerId,
      animalId,
      employeeId,
      appointmentId: dto.appointmentId,
      queueEntryId: dto.queueEntryId,
      hospitalBoxId: dto.hospitalBoxId,
      visitType,
      startedAt,
      status,
    };
  }

  private async syncVisitSourceStatus(
    tx: Prisma.TransactionClient,
    visit: Pick<ExistingVisit, 'appointmentId' | 'queueEntryId'>,
    status: VisitStatus,
  ) {
    const appointmentStatus = mapVisitStatusToAppointmentStatus(status);

    if (visit.appointmentId && appointmentStatus) {
      await tx.appointment.update({
        where: { id: visit.appointmentId },
        data: { status: appointmentStatus },
      });
    }

    const queueStatus = mapVisitStatusToQueueStatus(status);

    if (visit.queueEntryId && queueStatus) {
      await tx.queueEntry.update({
        where: { id: visit.queueEntryId },
        data: resolveQueueSourceStatusData(queueStatus, status),
      });
    }
  }

  private async getVisitForBilling(tx: Prisma.TransactionClient, visitId: string) {
    const visit = await tx.visit.findUnique({
      where: { id: visitId },
      select: { id: true, ownerId: true, animalId: true, status: true, completedAt: true },
    });

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    return visit;
  }

  private async syncLaboratoryOrderStatus(tx: Prisma.TransactionClient, orderId: string) {
    const items = await tx.laboratoryOrderItem.findMany({
      where: { orderId },
      select: { status: true },
    });

    const status = resolveLaboratoryOrderStatus(items.map((item) => item.status));
    await tx.laboratoryOrder.update({
      where: { id: orderId },
      data: {
        status,
        completedAt: status === LaboratoryOrderStatus.COMPLETED ? new Date() : null,
      },
    });
  }

  private async getOrCreateVisitBill(tx: Prisma.TransactionClient, visit: VisitBillingData) {
    await tx.$queryRaw`SELECT "id" FROM "Bill" WHERE "visitId" = ${visit.id} FOR UPDATE`;
    const existingBill = await tx.bill.findFirst({
      where: { visitId: visit.id },
      select: { id: true, status: true, paidAmount: true },
    });

    if (existingBill) {
      ensureVisitBillItemEditable(existingBill);
      return existingBill;
    }

    const dueAt = await this.financeService.getDefaultBillDueAt();

    return tx.bill.create({
      data: {
        ownerId: visit.ownerId,
        animalId: visit.animalId,
        visitId: visit.id,
        source: BillSource.VISIT,
        status: PaymentStatus.UNPAID,
        dueAt,
      },
      select: { id: true },
    });
  }

  private async getVisitBillItem(tx: Prisma.TransactionClient, visitId: string, billItemId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Bill" WHERE "visitId" = ${visitId} FOR UPDATE`;
    const billItem = await tx.billItem.findFirst({
      where: {
        id: billItemId,
        bill: { visitId },
      },
      include: { bill: { select: { id: true, status: true, paidAmount: true } } },
    });

    if (!billItem) {
      throw new NotFoundException('Visit bill item not found');
    }

    return billItem;
  }

  private async cancelUnpaidVisitBill(tx: Prisma.TransactionClient, visitId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Bill" WHERE "visitId" = ${visitId} FOR UPDATE`;
    const bill = await tx.bill.findUnique({
      where: { visitId },
      include: {
        items: {
          include: {
            bill: { select: { id: true, status: true, paidAmount: true } },
            hospitalRecord: { select: { id: true } },
          },
        },
      },
    });
    if (!bill || bill.status === PaymentStatus.CANCELLED) return;
    if (decimal(bill.paidAmount).greaterThan(0)) {
      throw new BadRequestException('Сначала оформите возврат оплаты и отмените счёт, затем отменяйте приём');
    }
    for (const item of bill.items) {
      if (item.hospitalRecord) continue;
      await this.restoreCurrentVisitProductWriteOff(tx, visitId, item);
    }
    await tx.bill.update({ where: { id: bill.id }, data: { status: PaymentStatus.CANCELLED } });
  }

  private async reopenCancelledVisitBill(tx: Prisma.TransactionClient, visitId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Bill" WHERE "visitId" = ${visitId} FOR UPDATE`;
    const bill = await tx.bill.findUnique({
      where: { visitId },
      select: { id: true, status: true, totalAmount: true, paidAmount: true },
    });
    if (!bill || bill.status !== PaymentStatus.CANCELLED) return;
    if (decimal(bill.paidAmount).greaterThan(0)) {
      throw new BadRequestException('Сначала оформите возврат оплаты, затем возвращайте приём в работу');
    }
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: resolvePaymentStatus(decimal(bill.totalAmount), decimal(bill.paidAmount)) },
    });
  }

  private async restoreCurrentVisitProductWriteOff(
    tx: Prisma.TransactionClient,
    visitId: string,
    item: {
      id: string;
      productId: string | null;
      title: string;
    },
  ) {
    if (!item.productId) return;
    const movements = await tx.stockMovement.findMany({
      where: {
        billItemId: item.id,
        productId: item.productId,
        type: { in: [StockMovementType.VISIT_USAGE, StockMovementType.CORRECTION] },
      },
      select: { quantity: true },
    });
    const deducted = movements.reduce((sum, movement) => sum.minus(movement.quantity), decimal(0));
    if (deducted.lessThanOrEqualTo(0)) return;
    await this.restoreVisitProduct(tx, visitId, item.id, item.productId, item.title, deducted, true);
  }

  private async recalculateVisitTotals(tx: Prisma.TransactionClient, visitId: string) {
    const bill = await tx.bill.findFirst({
      where: { visitId },
      include: { items: true },
    });

    if (!bill) {
      await tx.visit.update({
        where: { id: visitId },
        data: { totalAmount: 0 },
      });
      return;
    }

    const totalAmount = bill.items.reduce((sum, item) => sum.plus(item.totalAmount), decimal(0));
    const paidAmount = decimal(bill.paidAmount);
    const status = resolvePaymentStatus(totalAmount, paidAmount);

    await tx.bill.update({
      where: { id: bill.id },
      data: { totalAmount, status },
    });

    await tx.visit.update({
      where: { id: visitId },
      data: { totalAmount },
    });
  }

  private async resolveServiceLine(dto: AddVisitServiceDto) {
    if (dto.serviceId && dto.productId) {
      throw new BadRequestException('Строка приёма может ссылаться на услугу или товар, не одновременно');
    }

    const service = dto.serviceId
      ? await this.prisma.service.findFirst({
          where: { id: dto.serviceId, isActive: true },
          select: servicePricingSelect,
        })
      : null;

    if (dto.serviceId && !service) {
      throw new NotFoundException('Service not found');
    }

    const product = dto.productId
      ? await this.prisma.product.findFirst({
          where: { id: dto.productId, isActive: true },
          select: { id: true, title: true, retailPrice: true },
        })
      : null;

    if (dto.productId && !product) {
      throw new NotFoundException('Product not found');
    }

    return resolveBillItemLine({
      serviceId: service?.id,
      productId: product?.id,
      title: dto.title ?? service?.title ?? product?.title,
      quantity: dto.quantity ?? 1,
      stockQuantity: product ? dto.stockQuantity ?? dto.quantity ?? 1 : undefined,
      unitPrice:
        (service ? resolveServiceUnitPrice(service, dto.unitPrice) : dto.unitPrice) ??
        (product ? decimalToNumber(product.retailPrice) : 0),
      discount: dto.discount ?? 0,
    });
  }

  private async restoreVisitProduct(
    tx: Prisma.TransactionClient,
    visitId: string,
    billItemId: string,
    productId: string,
    title: string,
    quantityToRestore: Prisma.Decimal.Value,
    quantityIsInStockUnits = false,
  ) {
    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockUnit: true, writeOffUnit: true, packageQuantity: true },
    });
    let remaining = quantityIsInStockUnits ? decimal(quantityToRestore) : toStockQuantity(product, quantityToRestore);
    const movements = await tx.stockMovement.findMany({
      where: {
        billItemId,
        productId,
        stockBatchId: { not: null },
        type: { in: [StockMovementType.VISIT_USAGE, StockMovementType.CORRECTION] },
      },
      orderBy: { createdAt: 'desc' },
      select: { stockBatchId: true, warehouseId: true, quantity: true, createdAt: true },
    });
    const restorableByBatch = new Map<string, { stockBatchId: string; warehouseId: string | null; quantity: Prisma.Decimal; createdAt: Date }>();

    for (const movement of movements) {
      if (!movement.stockBatchId) {
        continue;
      }

      const existing = restorableByBatch.get(movement.stockBatchId) ?? {
        stockBatchId: movement.stockBatchId,
        warehouseId: movement.warehouseId,
        quantity: decimal(0),
        createdAt: movement.createdAt,
      };
      existing.quantity = existing.quantity.minus(movement.quantity);
      if (movement.createdAt > existing.createdAt) {
        existing.createdAt = movement.createdAt;
      }
      restorableByBatch.set(movement.stockBatchId, existing);
    }

    const restorable = [...restorableByBatch.values()]
      .filter((item) => item.quantity.greaterThan(0))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    for (const item of restorable) {
      if (remaining.lessThanOrEqualTo(0)) {
        break;
      }

      const quantity = item.quantity.lessThan(remaining) ? item.quantity : remaining;

      await tx.stockBatch.update({
        where: { id: item.stockBatchId },
        data: { rest: { increment: quantity } },
      });

      await tx.stockMovement.create({
        data: {
          productId,
          billItemId,
          stockBatchId: item.stockBatchId,
          warehouseId: item.warehouseId,
          visitId,
          type: StockMovementType.CORRECTION,
          quantity,
          comment: `Возврат списания "${title}" по приёму ${visitId.slice(0, 8)}`,
        },
      });

      remaining = remaining.minus(quantity);
    }

    if (remaining.greaterThan(0)) {
      throw new BadRequestException(`Не удалось вернуть списание товара "${title}" полностью`);
    }
  }

  private async getWarehouseScope(employeeId: string): Promise<WarehouseScope> {
    const accesses = await this.prisma.employeeWarehouseAccess.findMany({
      where: { employeeId },
      select: { warehouseId: true },
    });

    return accesses.length ? accesses.map((access) => access.warehouseId) : null;
  }

  private async getExistingVisit(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        ownerId: true,
        animalId: true,
        employeeId: true,
        appointmentId: true,
        queueEntryId: true,
        hospitalBoxId: true,
        visitType: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    return visit;
  }

  private async ensureVisitExists(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true },
    });

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
  }

  private async ensureDiagnosisBelongsToVisit(visitId: string, diagnosisId: string) {
    const diagnosis = await this.prisma.visitDiagnosis.findFirst({
      where: { id: diagnosisId, visitId },
      select: { id: true },
    });

    if (!diagnosis) {
      throw new NotFoundException('Visit diagnosis not found');
    }
  }

  private async syncCompletedVisitSnapshot(
    visit: Pick<ExistingVisit, 'id' | 'ownerId' | 'status'>,
    actorId: string,
  ) {
    if (!isPortalSnapshotStatus(visit.status)) return;

    await this.ownerGatewaySnapshotSyncService.enqueue({
      ownerId: visit.ownerId,
      visitId: visit.id,
      visitStatus: visit.status,
      actorId,
    });
    void this.ownerGatewaySnapshotSyncService.syncNow();
  }
}

const visitListInclude = {
  owner: {
    select: { id: true, fullName: true, phone: true, extraPhone: true },
  },
  animal: {
    select: { id: true, nickname: true, species: true, breed: true, sex: true, birthDate: true, status: true },
  },
  employee: {
    select: { id: true, fullName: true, position: true },
  },
  bill: {
    select: { id: true, status: true, totalAmount: true, paidAmount: true },
  },
  exam: {
    select: { purpose: true, weightKg: true, temperatureC: true },
  },
  _count: {
    select: { diagnoses: true, documents: true, files: true },
  },
} satisfies Prisma.VisitInclude;

const laboratoryServiceSelect = {
  select: servicePricingSelect,
} satisfies Prisma.ServiceDefaultArgs;

const laboratoryOrderInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      test: {
        select: { id: true, title: true, code: true, groupName: true },
      },
      profile: {
        select: { id: true, title: true, code: true },
      },
      billItem: {
        select: { id: true, title: true, totalAmount: true },
      },
    },
  },
} satisfies Prisma.LaboratoryOrderInclude;

const visitInclude = {
  owner: true,
  animal: {
    include: {
      weights: {
        orderBy: { measuredAt: 'desc' },
        take: 5,
      },
      vaccinations: {
        orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
        take: 5,
      },
    },
  },
  employee: {
    select: { id: true, fullName: true, position: true },
  },
  appointment: true,
  queueEntry: true,
  hospitalBox: true,
  hospitalStay: {
    include: { hospitalBox: true },
  },
  exam: true,
  diagnoses: {
    orderBy: { createdAt: 'asc' },
  },
  recommendation: true,
  laboratoryOrders: {
    orderBy: { createdAt: 'desc' },
    include: laboratoryOrderInclude,
  },
  bill: {
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          service: {
            select: servicePricingSelect,
          },
          product: {
            select: { id: true, title: true, retailPrice: true, stockUnit: true, writeOffUnit: true, billingUnit: true },
          },
          stockMovements: {
            orderBy: { createdAt: 'asc' },
            include: {
              stockBatch: { select: { id: true, series: true, expiresAt: true } },
              warehouse: { select: { id: true, name: true } },
            },
          },
        },
      },
      payments: {
        orderBy: { paidAt: 'desc' },
      },
    },
  },
} satisfies Prisma.VisitInclude;

type ExistingVisit = Prisma.VisitGetPayload<{
  select: {
    id: true;
    ownerId: true;
    animalId: true;
    employeeId: true;
    appointmentId: true;
    queueEntryId: true;
    hospitalBoxId: true;
    visitType: true;
    status: true;
    startedAt: true;
    completedAt: true;
  };
}>;

type VisitCreationData = {
  ownerId: string;
  animalId: string;
  employeeId: string;
  appointmentId?: string;
  queueEntryId?: string;
  hospitalBoxId?: string;
  visitType?: VisitType;
  startedAt: Date;
  status: VisitStatus;
};

type VisitBillingData = {
  id: string;
  ownerId: string;
  animalId: string;
  status: VisitStatus;
  completedAt: Date | null;
};

type LaboratoryServiceForBilling = {
  id: string;
  title: string;
  price: Prisma.Decimal;
  priceType: string;
  minimumPrice: Prisma.Decimal | null;
  maximumPrice: Prisma.Decimal | null;
} | null;

type LaboratoryTestForOrder = {
  id: string;
  title: string;
  code: string | null;
  groupName: string | null;
  material: string | null;
  method: string | null;
  unit: string | null;
  referenceRange: string | null;
};

function resolveVisitStatusData(status: VisitStatus | undefined, existing: Pick<ExistingVisit, 'startedAt'>) {
  if (!status) {
    return {};
  }

  return {
    status,
    ...(status === VisitStatus.IN_PROGRESS ? { startedAt: existing.startedAt ?? new Date(), completedAt: null } : {}),
    ...(status === VisitStatus.COMPLETED || status === VisitStatus.CANCELLED ? { completedAt: new Date() } : {}),
  };
}

function mapVisitStatusToAppointmentStatus(status: VisitStatus) {
  if (status === VisitStatus.IN_PROGRESS) {
    return AppointmentStatus.IN_PROGRESS;
  }

  if (status === VisitStatus.COMPLETED) {
    return AppointmentStatus.COMPLETED;
  }

  if (status === VisitStatus.CANCELLED) {
    return AppointmentStatus.CANCELLED;
  }

  return undefined;
}

function mapVisitStatusToQueueStatus(status: VisitStatus) {
  if (status === VisitStatus.IN_PROGRESS || status === VisitStatus.COMPLETED) {
    return QueueStatus.COMPLETED;
  }

  if (status === VisitStatus.CANCELLED) {
    return QueueStatus.CANCELLED;
  }

  return undefined;
}

function resolveQueueSourceStatusData(queueStatus: QueueStatus, visitStatus: VisitStatus): Prisma.QueueEntryUncheckedUpdateInput {
  return {
    status: queueStatus,
    ...(queueStatus === QueueStatus.COMPLETED && visitStatus === VisitStatus.IN_PROGRESS ? { completedAt: new Date() } : {}),
    ...(queueStatus === QueueStatus.CANCELLED ? { completedAt: new Date() } : {}),
  };
}

function resolveBillItemLine(input: {
  serviceId?: string;
  productId?: string;
  title?: string;
  quantity?: number;
  stockQuantity?: number;
  unitPrice?: number;
  discount?: number;
}) {
  const title = input.title?.trim();

  if (!title) {
    throw new BadRequestException('Service title is required');
  }

  const quantity = decimal(input.quantity ?? 1);
  const stockQuantity = input.productId ? decimal(input.stockQuantity ?? input.quantity ?? 1) : null;
  const unitPrice = decimal(input.unitPrice ?? 0);
  const discount = decimal(input.discount ?? 0);
  const totalAmount = maxDecimal(quantity.mul(unitPrice).minus(discount), decimal(0));

  return {
    serviceId: input.serviceId,
    productId: input.productId,
    title,
    quantity,
    stockQuantity,
    unitPrice,
    discount,
    totalAmount,
  };
}

async function createBillItemFromService(tx: Prisma.TransactionClient, billId: string, service: LaboratoryServiceForBilling) {
  if (!service) {
    return null;
  }

  const line = resolveBillItemLine({
    serviceId: service.id,
    title: service.title,
    quantity: 1,
    unitPrice: resolveServiceUnitPrice(service),
    discount: 0,
  });

  const billItem = await tx.billItem.create({
    data: {
      billId,
      serviceId: line.serviceId,
      title: line.title,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      totalAmount: line.totalAmount,
    },
    select: { id: true },
  });

  return billItem.id;
}

function toLaboratoryOrderItemData(
  orderId: string,
  test: LaboratoryTestForOrder,
  profileId: string | null,
  billItemId: string | null,
): Prisma.LaboratoryOrderItemUncheckedCreateInput {
  return {
    orderId,
    testId: test.id,
    profileId,
    billItemId,
    title: test.title,
    code: test.code,
    groupName: test.groupName,
    material: test.material,
    method: test.method,
    unit: test.unit,
    referenceRange: test.referenceRange,
  };
}

function resolveLaboratoryOrderStatus(itemStatuses: LaboratoryOrderItemStatus[]) {
  if (!itemStatuses.length) {
    return LaboratoryOrderStatus.ORDERED;
  }

  if (itemStatuses.every((status) => status === LaboratoryOrderItemStatus.CANCELLED)) {
    return LaboratoryOrderStatus.CANCELLED;
  }

  if (itemStatuses.every((status) => status === LaboratoryOrderItemStatus.COMPLETED)) {
    return LaboratoryOrderStatus.COMPLETED;
  }

  if (itemStatuses.some((status) => status === LaboratoryOrderItemStatus.IN_PROGRESS || status === LaboratoryOrderItemStatus.COMPLETED)) {
    return LaboratoryOrderStatus.IN_PROGRESS;
  }

  return LaboratoryOrderStatus.ORDERED;
}

function ensureVisitEditable(visit: { status: VisitStatus; completedAt: Date | null }, actor: Pick<AuthEmployee, 'roles'>) {
  if (actor.roles.includes('director')) {
    return;
  }

  if (visit.status === VisitStatus.CANCELLED) {
    throw new BadRequestException('Отменённый приём нельзя редактировать');
  }

  if (visit.status !== VisitStatus.COMPLETED) {
    return;
  }

  if (visit.completedAt && Date.now() - visit.completedAt.getTime() <= COMPLETED_VISIT_EDIT_GRACE_MS) {
    return;
  }

  throw new BadRequestException('Завершённый приём можно редактировать только директору или в течение 30 минут после завершения');
}

function ensureVisitOperational(visit: { status: VisitStatus }) {
  if (visit.status === VisitStatus.CANCELLED) {
    throw new BadRequestException('Отменённый приём не создаёт начислений. Сначала верните приём в работу');
  }
}

function ensureVisitBillItemEditable(bill: { status: PaymentStatus; paidAmount: Prisma.Decimal }) {
  if (bill.status === PaymentStatus.CANCELLED) {
    throw new BadRequestException('Отменённый счёт нельзя менять. Сначала откройте счёт повторно');
  }
  if (decimal(bill.paidAmount).greaterThan(0)) {
    throw new BadRequestException('Оплаченные позиции нельзя менять до оформления возврата');
  }
}

function isPortalSnapshotStatus(status: VisitStatus) {
  return status === VisitStatus.COMPLETED || status === VisitStatus.CANCELLED;
}

function uniqueIds(ids?: string[]) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolvePaymentStatus(totalAmount: Prisma.Decimal, paidAmount: Prisma.Decimal) {
  if (paidAmount.greaterThanOrEqualTo(totalAmount) && totalAmount.greaterThan(0)) {
    return PaymentStatus.PAID;
  }

  if (paidAmount.greaterThan(0)) {
    return PaymentStatus.PARTIAL;
  }

  return PaymentStatus.UNPAID;
}

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function decimalToNumber(value: Prisma.Decimal.Value) {
  return decimal(value).toNumber();
}

function maxDecimal(left: Prisma.Decimal, right: Prisma.Decimal) {
  return left.lessThan(right) ? right : left;
}
