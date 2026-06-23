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
} from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { FinanceService } from '../finance/finance.service';
import { MedicalPhrasesService } from '../medical-phrases/medical-phrases.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AddVisitServiceDto } from './dto/add-visit-service.dto';
import { CreateVisitLaboratoryOrderDto } from './dto/create-visit-laboratory-order.dto';
import { CreateVisitDiagnosisDto } from './dto/create-visit-diagnosis.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { ListVisitsQueryDto } from './dto/list-visits-query.dto';
import { UpdateVisitDiagnosisDto } from './dto/update-visit-diagnosis.dto';
import { UpdateVisitLaboratoryItemDto } from './dto/update-visit-laboratory-item.dto';
import { UpdateVisitServiceDto } from './dto/update-visit-service.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { UpsertVisitExamDto } from './dto/upsert-visit-exam.dto';
import { UpsertVisitRecommendationDto } from './dto/upsert-visit-recommendation.dto';

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
  ) {}

  async listVisits(query: ListVisitsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.VisitWhereInput = {
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
            OR: [
              { owner: { fullName: { contains: search, mode: 'insensitive' } } },
              { owner: { phone: { contains: search, mode: 'insensitive' } } },
              { animal: { nickname: { contains: search, mode: 'insensitive' } } },
              { employee: { fullName: { contains: search, mode: 'insensitive' } } },
              { exam: { purpose: { contains: search, mode: 'insensitive' } } },
              { exam: { anamnesis: { contains: search, mode: 'insensitive' } } },
              { exam: { examination: { contains: search, mode: 'insensitive' } } },
              { recommendation: { treatmentPlan: { contains: search, mode: 'insensitive' } } },
              { diagnoses: { some: { title: { contains: search, mode: 'insensitive' } } } },
            ],
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

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
    }

    if (dto.hospitalBoxId) {
      await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);
    }

    const statusData = resolveVisitStatusData(dto.status, existing);

    const visit = await this.prisma.$transaction(async (tx) => {
      const updatedVisit = await tx.visit.update({
        where: { id: visitId },
        data: {
          ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
          ...(dto.hospitalBoxId !== undefined ? { hospitalBoxId: dto.hospitalBoxId } : {}),
          ...statusData,
        },
      });

      if (dto.status) {
        await this.syncVisitSourceStatus(tx, updatedVisit, dto.status);
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

  async upsertExam(visitId: string, dto: UpsertVisitExamDto, actor: AuthEmployee) {
    const visit = await this.getExistingVisit(visitId);
    ensureVisitEditable(visit, actor);

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
        'visit.exam.anamnesis': dto.anamnesis,
        'visit.exam.examination': dto.examination,
        'visit.exam.symptoms': dto.symptoms,
        'visit.exam.manipulations': dto.manipulations,
        'visit.exam.comment': dto.comment,
      },
      actor,
    );

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

    return { deleted: true };
  }

  async addService(visitId: string, dto: AddVisitServiceDto, actor: AuthEmployee) {
    const warehouseScope = await this.getWarehouseScope(actor.id);
    const serviceLine = await this.resolveServiceLine(dto);

    const billItem = await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      ensureVisitEditable(visit, actor);
      const bill = await this.getOrCreateVisitBill(tx, visit);
      const createdBillItem = await tx.billItem.create({
        data: {
          billId: bill.id,
          serviceId: serviceLine.serviceId,
          productId: serviceLine.productId,
          title: serviceLine.title,
          quantity: serviceLine.quantity,
          unitPrice: serviceLine.unitPrice,
          discount: serviceLine.discount,
          totalAmount: serviceLine.totalAmount,
        },
      });

      if (serviceLine.productId) {
        await this.writeOffVisitProduct(tx, visitId, createdBillItem.id, serviceLine, warehouseScope);
      }

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

  async updateService(visitId: string, billItemId: string, dto: UpdateVisitServiceDto, actor: AuthEmployee) {
    const warehouseScope = await this.getWarehouseScope(actor.id);
    const billItem = await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      ensureVisitEditable(visit, actor);
      const existingBillItem = await this.getVisitBillItem(tx, visitId, billItemId);
      const line = resolveBillItemLine({
        serviceId: existingBillItem.serviceId ?? undefined,
        productId: existingBillItem.productId ?? undefined,
        title: dto.title ?? existingBillItem.title,
        quantity: dto.quantity ?? decimalToNumber(existingBillItem.quantity),
        unitPrice: dto.unitPrice ?? decimalToNumber(existingBillItem.unitPrice),
        discount: dto.discount ?? decimalToNumber(existingBillItem.discount),
      });

      const updatedBillItem = await tx.billItem.update({
        where: { id: billItemId },
        data: {
          title: line.title,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          totalAmount: line.totalAmount,
        },
      });

      if (existingBillItem.productId) {
        const delta = line.quantity.minus(existingBillItem.quantity);
        if (delta.greaterThan(0)) {
          await this.writeOffVisitProduct(tx, visitId, billItemId, { ...line, quantity: delta }, warehouseScope);
        } else if (delta.lessThan(0)) {
          await this.restoreVisitProduct(tx, visitId, billItemId, existingBillItem.productId, existingBillItem.title, delta.abs());
        }
      }

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
      const billItem = await this.getVisitBillItem(tx, visitId, billItemId);
      if (billItem.productId) {
        await this.restoreVisitProduct(tx, visitId, billItemId, billItem.productId, billItem.title, billItem.quantity);
      }
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
        include: { service: laboratoryServiceSelect },
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

    if (profiles.length !== profileIds.length) {
      throw new NotFoundException('Один или несколько профилей не найдены или выключены');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      ensureVisitEditable(visit, actor);
      const bill = await this.getOrCreateVisitBill(tx, visit);
      const createdOrder = await tx.laboratoryOrder.create({
        data: {
          visitId,
          createdById: actor.id,
          comment: clean(dto.comment),
        },
      });

      for (const test of tests) {
        const billItemId = await createBillItemFromService(tx, bill.id, test.service);
        await tx.laboratoryOrderItem.create({
          data: toLaboratoryOrderItemData(createdOrder.id, test, null, billItemId),
        });
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
      metadata: { visitId, items: order.items.length, testIds, profileIds },
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

    const visit = await this.prisma.$transaction(async (tx) => {
      const updatedVisit = await tx.visit.update({
        where: { id: visitId },
        data: resolveVisitStatusData(status, existing),
      });

      await this.syncVisitSourceStatus(tx, updatedVisit, status);

      return updatedVisit;
    });

    await this.auditService.log({
      actorId: actor.id,
      action,
      entityType: 'Visit',
      entityId: visit.id,
      metadata: { status },
    });

    return this.getVisit(visit.id);
  }

  private async resolveVisitCreationData(dto: CreateVisitDto, actor: AuthEmployee): Promise<VisitCreationData> {
    if (dto.appointmentId && dto.queueEntryId) {
      throw new BadRequestException('Visit can be linked to appointment or queue entry, not both');
    }

    let ownerId = dto.ownerId;
    let animalId = dto.animalId;
    let employeeId = dto.employeeId;

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
        select: { ownerId: true, animalId: true, employeeId: true, visit: { select: { id: true } } },
      });

      if (!queueEntry) {
        throw new NotFoundException('Queue entry not found');
      }

      if (queueEntry.visit) {
        throw new BadRequestException('Queue entry already has a visit');
      }

      if (!queueEntry.ownerId || !queueEntry.animalId) {
        throw new BadRequestException('Queue entry must be linked to existing owner and animal before visit');
      }

      ownerId = queueEntry.ownerId;
      animalId = queueEntry.animalId;
      employeeId = employeeId ?? queueEntry.employeeId ?? actor.id;
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
    const existingBill = await tx.bill.findFirst({
      where: { visitId: visit.id },
      select: { id: true },
    });

    if (existingBill) {
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
    const billItem = await tx.billItem.findFirst({
      where: {
        id: billItemId,
        bill: { visitId },
      },
    });

    if (!billItem) {
      throw new NotFoundException('Visit bill item not found');
    }

    return billItem;
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
      ? await this.prisma.service.findUnique({
          where: { id: dto.serviceId },
          select: { id: true, title: true, price: true },
        })
      : null;

    if (dto.serviceId && !service) {
      throw new NotFoundException('Service not found');
    }

    const product = dto.productId
      ? await this.prisma.product.findUnique({
          where: { id: dto.productId },
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
      unitPrice:
        dto.unitPrice ??
        (service ? decimalToNumber(service.price) : undefined) ??
        (product ? decimalToNumber(product.retailPrice) : 0),
      discount: dto.discount ?? 0,
    });
  }

  private async writeOffVisitProduct(
    tx: Prisma.TransactionClient,
    visitId: string,
    billItemId: string,
    line: BillItemLine,
    warehouseScope: WarehouseScope,
  ) {
    const productId = line.productId;
    if (!productId) {
      return;
    }

    const batches = await tx.stockBatch.findMany({
      where: {
        productId,
        rest: { gt: 0 },
        ...(warehouseScope ? { warehouseId: { in: warehouseScope } } : {}),
      },
      select: { id: true, warehouseId: true, rest: true, expiresAt: true, createdAt: true },
    });
    const orderedBatches = batches.sort(compareStockBatches);
    const available = orderedBatches.reduce((sum, batch) => sum.plus(batch.rest), decimal(0));

    if (available.lessThan(line.quantity)) {
      throw new BadRequestException(`Недостаточно остатка товара "${line.title}"`);
    }

    let remaining = line.quantity;

    for (const batch of orderedBatches) {
      if (remaining.lessThanOrEqualTo(0)) {
        break;
      }

      const batchRest = decimal(batch.rest);
      const quantity = batchRest.lessThan(remaining) ? batchRest : remaining;

      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { rest: { decrement: quantity } },
      });

      await tx.stockMovement.create({
        data: {
          productId,
          billItemId,
          stockBatchId: batch.id,
          warehouseId: batch.warehouseId,
          visitId,
          type: StockMovementType.VISIT_USAGE,
          quantity: quantity.negated(),
          comment: `Списание по приёму ${visitId.slice(0, 8)}`,
        },
      });

      remaining = remaining.minus(quantity);
    }
  }

  private async restoreVisitProduct(
    tx: Prisma.TransactionClient,
    visitId: string,
    billItemId: string,
    productId: string,
    title: string,
    quantityToRestore: Prisma.Decimal.Value,
  ) {
    let remaining = decimal(quantityToRestore);
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
}

const visitListInclude = {
  owner: {
    select: { id: true, fullName: true, phone: true, extraPhone: true },
  },
  animal: {
    select: { id: true, nickname: true, species: true, breed: true, sex: true, status: true },
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
  select: { id: true, title: true, price: true },
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
            select: { id: true, title: true, price: true },
          },
          product: {
            select: { id: true, title: true, retailPrice: true },
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
  unitPrice?: number;
  discount?: number;
}) {
  const title = input.title?.trim();

  if (!title) {
    throw new BadRequestException('Service title is required');
  }

  const quantity = decimal(input.quantity ?? 1);
  const unitPrice = decimal(input.unitPrice ?? 0);
  const discount = decimal(input.discount ?? 0);
  const totalAmount = maxDecimal(quantity.mul(unitPrice).minus(discount), decimal(0));

  return {
    serviceId: input.serviceId,
    productId: input.productId,
    title,
    quantity,
    unitPrice,
    discount,
    totalAmount,
  };
}

type BillItemLine = ReturnType<typeof resolveBillItemLine>;

function compareStockBatches(
  left: { expiresAt: Date | null; createdAt: Date },
  right: { expiresAt: Date | null; createdAt: Date },
) {
  if (left.expiresAt && right.expiresAt && left.expiresAt.getTime() !== right.expiresAt.getTime()) {
    return left.expiresAt.getTime() - right.expiresAt.getTime();
  }

  if (left.expiresAt && !right.expiresAt) {
    return -1;
  }

  if (!left.expiresAt && right.expiresAt) {
    return 1;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}

async function createBillItemFromService(tx: Prisma.TransactionClient, billId: string, service: LaboratoryServiceForBilling) {
  if (!service) {
    return null;
  }

  const line = resolveBillItemLine({
    serviceId: service.id,
    title: service.title,
    quantity: 1,
    unitPrice: decimalToNumber(service.price),
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
  if (visit.status === VisitStatus.CANCELLED) {
    throw new BadRequestException('Отменённый приём нельзя редактировать');
  }

  if (visit.status !== VisitStatus.COMPLETED) {
    return;
  }

  if (actor.roles.includes('director')) {
    return;
  }

  if (visit.completedAt && Date.now() - visit.completedAt.getTime() <= COMPLETED_VISIT_EDIT_GRACE_MS) {
    return;
  }

  throw new BadRequestException('Завершённый приём можно редактировать только директору или в течение 30 минут после завершения');
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
