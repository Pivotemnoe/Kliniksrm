import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, BillSource, PaymentStatus, Prisma, QueueStatus, VisitStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AddVisitServiceDto } from './dto/add-visit-service.dto';
import { CreateVisitDiagnosisDto } from './dto/create-visit-diagnosis.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { ListVisitsQueryDto } from './dto/list-visits-query.dto';
import { UpdateVisitDiagnosisDto } from './dto/update-visit-diagnosis.dto';
import { UpdateVisitServiceDto } from './dto/update-visit-service.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { UpsertVisitExamDto } from './dto/upsert-visit-exam.dto';
import { UpsertVisitRecommendationDto } from './dto/upsert-visit-recommendation.dto';

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
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

    const visit = await this.prisma.$transaction(async (tx) => {
      const createdVisit = await tx.visit.create({
        data: {
          ownerId: data.ownerId,
          animalId: data.animalId,
          employeeId: data.employeeId,
          appointmentId: data.appointmentId,
          queueEntryId: data.queueEntryId,
          hospitalBoxId: data.hospitalBoxId,
          status: VisitStatus.IN_PROGRESS,
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
        },
      });

      await this.syncVisitSourceStatus(tx, createdVisit, VisitStatus.IN_PROGRESS);

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

  async updateVisit(visitId: string, dto: UpdateVisitDto, actorId: string) {
    const existing = await this.getExistingVisit(visitId);

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
      actorId,
      action: 'visit.update',
      entityType: 'Visit',
      entityId: visit.id,
      metadata: { changedFields: Object.keys(dto), status: visit.status },
    });

    return this.getVisit(visit.id);
  }

  async startVisit(visitId: string, actorId: string) {
    return this.setStatus(visitId, VisitStatus.IN_PROGRESS, actorId, 'visit.start');
  }

  async completeVisit(visitId: string, actorId: string) {
    return this.setStatus(visitId, VisitStatus.COMPLETED, actorId, 'visit.complete');
  }

  async cancelVisit(visitId: string, actorId: string) {
    return this.setStatus(visitId, VisitStatus.CANCELLED, actorId, 'visit.cancel');
  }

  async upsertExam(visitId: string, dto: UpsertVisitExamDto, actorId: string) {
    const visit = await this.getExistingVisit(visitId);

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
      actorId,
      action: 'visit_exam.upsert',
      entityType: 'Visit',
      entityId: visitId,
      metadata: { changedFields: Object.keys(dto), weightRecorded: dto.weightKg !== undefined },
    });

    return exam;
  }

  async upsertRecommendation(visitId: string, dto: UpsertVisitRecommendationDto, actorId: string) {
    await this.ensureVisitExists(visitId);

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
      actorId,
      action: 'visit_recommendation.upsert',
      entityType: 'Visit',
      entityId: visitId,
      metadata: { changedFields: Object.keys(dto) },
    });

    return recommendation;
  }

  async createDiagnosis(visitId: string, dto: CreateVisitDiagnosisDto, actorId: string) {
    await this.ensureVisitExists(visitId);

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
      actorId,
      action: 'visit_diagnosis.create',
      entityType: 'VisitDiagnosis',
      entityId: diagnosis.id,
      metadata: { visitId },
    });

    return diagnosis;
  }

  async updateDiagnosis(visitId: string, diagnosisId: string, dto: UpdateVisitDiagnosisDto, actorId: string) {
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
      actorId,
      action: 'visit_diagnosis.update',
      entityType: 'VisitDiagnosis',
      entityId: diagnosis.id,
      metadata: { visitId, changedFields: Object.keys(dto) },
    });

    return diagnosis;
  }

  async deleteDiagnosis(visitId: string, diagnosisId: string, actorId: string) {
    await this.ensureDiagnosisBelongsToVisit(visitId, diagnosisId);

    await this.prisma.visitDiagnosis.delete({ where: { id: diagnosisId } });

    await this.auditService.log({
      actorId,
      action: 'visit_diagnosis.delete',
      entityType: 'VisitDiagnosis',
      entityId: diagnosisId,
      metadata: { visitId },
    });

    return { deleted: true };
  }

  async addService(visitId: string, dto: AddVisitServiceDto, actorId: string) {
    const serviceLine = await this.resolveServiceLine(dto);

    const billItem = await this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisitForBilling(tx, visitId);
      const bill = await this.getOrCreateVisitBill(tx, visit);
      const createdBillItem = await tx.billItem.create({
        data: {
          billId: bill.id,
          serviceId: serviceLine.serviceId,
          title: serviceLine.title,
          quantity: serviceLine.quantity,
          unitPrice: serviceLine.unitPrice,
          discount: serviceLine.discount,
          totalAmount: serviceLine.totalAmount,
        },
      });

      await this.recalculateVisitTotals(tx, visitId);

      return createdBillItem;
    });

    await this.auditService.log({
      actorId,
      action: 'visit_service.add',
      entityType: 'BillItem',
      entityId: billItem.id,
      metadata: { visitId, title: billItem.title, totalAmount: billItem.totalAmount },
    });

    return billItem;
  }

  async updateService(visitId: string, billItemId: string, dto: UpdateVisitServiceDto, actorId: string) {
    const billItem = await this.prisma.$transaction(async (tx) => {
      const existingBillItem = await this.getVisitBillItem(tx, visitId, billItemId);
      const line = resolveBillItemLine({
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

      await this.recalculateVisitTotals(tx, visitId);

      return updatedBillItem;
    });

    await this.auditService.log({
      actorId,
      action: 'visit_service.update',
      entityType: 'BillItem',
      entityId: billItem.id,
      metadata: { visitId, changedFields: Object.keys(dto), totalAmount: billItem.totalAmount },
    });

    return billItem;
  }

  async deleteService(visitId: string, billItemId: string, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.getVisitBillItem(tx, visitId, billItemId);
      await tx.billItem.delete({ where: { id: billItemId } });
      await this.recalculateVisitTotals(tx, visitId);
    });

    await this.auditService.log({
      actorId,
      action: 'visit_service.delete',
      entityType: 'BillItem',
      entityId: billItemId,
      metadata: { visitId },
    });

    return { deleted: true };
  }

  private async setStatus(visitId: string, status: VisitStatus, actorId: string, action: string) {
    const existing = await this.getExistingVisit(visitId);

    const visit = await this.prisma.$transaction(async (tx) => {
      const updatedVisit = await tx.visit.update({
        where: { id: visitId },
        data: resolveVisitStatusData(status, existing),
      });

      await this.syncVisitSourceStatus(tx, updatedVisit, status);

      return updatedVisit;
    });

    await this.auditService.log({
      actorId,
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
    };
  }

  private async syncVisitSourceStatus(
    tx: Prisma.TransactionClient,
    visit: Pick<ExistingVisit, 'appointmentId' | 'queueEntryId'>,
    status: VisitStatus,
  ) {
    const mappedStatus = mapVisitStatusToSource(status);

    if (visit.appointmentId && mappedStatus.appointmentStatus) {
      await tx.appointment.update({
        where: { id: visit.appointmentId },
        data: { status: mappedStatus.appointmentStatus },
      });
    }

    if (visit.queueEntryId && mappedStatus.queueStatus) {
      await tx.queueEntry.update({
        where: { id: visit.queueEntryId },
        data: {
          status: mappedStatus.queueStatus,
          ...(mappedStatus.queueStatus === QueueStatus.IN_PROGRESS ? { startedAt: new Date() } : {}),
          ...(mappedStatus.queueStatus === QueueStatus.COMPLETED || mappedStatus.queueStatus === QueueStatus.CANCELLED
            ? { completedAt: new Date() }
            : {}),
        },
      });
    }
  }

  private async getVisitForBilling(tx: Prisma.TransactionClient, visitId: string) {
    const visit = await tx.visit.findUnique({
      where: { id: visitId },
      select: { id: true, ownerId: true, animalId: true },
    });

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    return visit;
  }

  private async getOrCreateVisitBill(tx: Prisma.TransactionClient, visit: VisitBillingData) {
    const existingBill = await tx.bill.findFirst({
      where: { visitId: visit.id },
      select: { id: true },
    });

    if (existingBill) {
      return existingBill;
    }

    return tx.bill.create({
      data: {
        ownerId: visit.ownerId,
        animalId: visit.animalId,
        visitId: visit.id,
        source: BillSource.VISIT,
        status: PaymentStatus.UNPAID,
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
    const service = dto.serviceId
      ? await this.prisma.service.findUnique({
          where: { id: dto.serviceId },
          select: { id: true, title: true, price: true },
        })
      : null;

    if (dto.serviceId && !service) {
      throw new NotFoundException('Service not found');
    }

    return resolveBillItemLine({
      serviceId: service?.id,
      title: dto.title ?? service?.title,
      quantity: dto.quantity ?? 1,
      unitPrice: dto.unitPrice ?? (service ? decimalToNumber(service.price) : 0),
      discount: dto.discount ?? 0,
    });
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
  _count: {
    select: { diagnoses: true, documents: true, files: true },
  },
} satisfies Prisma.VisitInclude;

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
};

type VisitBillingData = {
  id: string;
  ownerId: string;
  animalId: string;
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

function mapVisitStatusToSource(status: VisitStatus) {
  if (status === VisitStatus.IN_PROGRESS) {
    return { appointmentStatus: AppointmentStatus.IN_PROGRESS, queueStatus: QueueStatus.IN_PROGRESS };
  }

  if (status === VisitStatus.COMPLETED) {
    return { appointmentStatus: AppointmentStatus.COMPLETED, queueStatus: QueueStatus.COMPLETED };
  }

  if (status === VisitStatus.CANCELLED) {
    return { appointmentStatus: AppointmentStatus.CANCELLED, queueStatus: QueueStatus.CANCELLED };
  }

  return {};
}

function resolveBillItemLine(input: {
  serviceId?: string;
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
    title,
    quantity,
    unitPrice,
    discount,
    totalAmount,
  };
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
