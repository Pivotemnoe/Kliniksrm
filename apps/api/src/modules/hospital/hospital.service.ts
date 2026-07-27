import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillSource, PaymentStatus, Prisma, VisitStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AdmitHospitalPatientDto } from './dto/admit-hospital-patient.dto';
import { AdmitExistingHospitalStayDto } from './dto/admit-existing-hospital-stay.dto';
import { CreateHospitalRecordDto } from './dto/create-hospital-record.dto';
import { ListHospitalQueryDto } from './dto/list-hospital-query.dto';
import { UpdateHospitalStayDto } from './dto/update-hospital-stay.dto';

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
    const where: Prisma.VisitWhereInput = {
      hospitalBoxId: query.hospitalBoxId ? query.hospitalBoxId : { not: null },
      status: query.status ?? { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] },
      ...(search
        ? {
            OR: [
              { owner: { fullName: { contains: search, mode: 'insensitive' } } },
              { owner: { phone: { contains: search, mode: 'insensitive' } } },
              { animal: { nickname: { contains: search, mode: 'insensitive' } } },
              { animal: { species: { contains: search, mode: 'insensitive' } } },
              { hospitalBox: { name: { contains: search, mode: 'insensitive' } } },
              { exam: { purpose: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        orderBy: { startedAt: 'asc' },
        include: hospitalVisitInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async getResources() {
    const boxes = await this.prisma.hospitalBox.findMany({
      orderBy: { name: 'asc' },
      include: { office: { select: { id: true, name: true } } },
    });

    return { boxes };
  }

  async getHospitalStay(visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, hospitalBoxId: { not: null } },
      include: hospitalStayCardInclude,
    });

    if (!visit) {
      throw new NotFoundException('Hospital stay not found');
    }

    return visit;
  }

  async createRecord(visitId: string, dto: CreateHospitalRecordDto, actorId: string) {
    const stay = await this.getExistingHospitalStay(visitId);

    if (stay.status !== VisitStatus.DRAFT && stay.status !== VisitStatus.IN_PROGRESS) {
      throw new BadRequestException('Hospital journal is closed after discharge or cancellation');
    }

    const record = await this.prisma.hospitalRecord.create({
      data: {
        visitId,
        recordedById: actorId,
        recordType: dto.recordType,
        title: dto.title.trim(),
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : undefined,
        temperatureC: dto.temperatureC,
        value: dto.value?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: hospitalRecordAuthorInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.record.create',
      entityType: 'HospitalRecord',
      entityId: record.id,
      metadata: { visitId, recordType: dto.recordType },
    });

    return record;
  }

  async admitExisting(visitId: string, dto: AdmitExistingHospitalStayDto, actorId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true, status: true },
    });

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatus.DRAFT && visit.status !== VisitStatus.IN_PROGRESS) {
      throw new BadRequestException('Only an active visit can be admitted to hospital');
    }

    const box = await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
    }

    await this.prisma.visit.update({
      where: { id: visitId },
      data: {
        hospitalBoxId: box.id,
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
      },
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.admit.existing',
      entityType: 'Visit',
      entityId: visitId,
      metadata: { hospitalBoxId: box.id },
    });

    return this.getHospitalStay(visitId);
  }

  async admit(dto: AdmitHospitalPatientDto, actorId: string) {
    const ownerId = await this.schedulingService.resolveAnimalOwner(dto.animalId, dto.ownerId);
    const box = await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);
    const dueAt = await this.financeService.getDefaultBillDueAt();

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
    }

    const visit = await this.prisma.$transaction(async (tx) => {
      const createdVisit = await tx.visit.create({
        data: {
          ownerId,
          animalId: dto.animalId,
          employeeId: dto.employeeId,
          hospitalBoxId: box.id,
          startedAt: dto.admittedAt ? new Date(dto.admittedAt) : undefined,
          status: dto.status ?? VisitStatus.IN_PROGRESS,
          exam: dto.purpose
            ? {
                create: {
                  purpose: dto.purpose,
                },
              }
            : undefined,
        },
      });

      await tx.bill.create({
        data: {
          ownerId,
          animalId: dto.animalId,
          visitId: createdVisit.id,
          source: BillSource.VISIT,
          status: PaymentStatus.UNPAID,
          dueAt,
        },
      });

      return createdVisit;
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.admit',
      entityType: 'Visit',
      entityId: visit.id,
      metadata: { ownerId, animalId: dto.animalId, hospitalBoxId: box.id },
    });

    return this.getHospitalStay(visit.id);
  }

  async updateStay(visitId: string, dto: UpdateHospitalStayDto, actorId: string) {
    const existing = await this.getExistingHospitalStay(visitId);

    if (dto.hospitalBoxId) {
      await this.schedulingService.ensureHospitalBoxExists(dto.hospitalBoxId);
    }

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
    }

    const updatedVisit = await this.prisma.visit.update({
      where: { id: existing.id },
      data: {
        ...(dto.hospitalBoxId !== undefined ? { hospitalBoxId: dto.hospitalBoxId } : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
      },
      include: hospitalVisitInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.update',
      entityType: 'Visit',
      entityId: visitId,
      metadata: { changedFields: Object.keys(dto) },
    });

    return updatedVisit;
  }

  async discharge(visitId: string, actorId: string) {
    const existing = await this.getExistingHospitalStay(visitId);

    if (existing.status === VisitStatus.CANCELLED) {
      throw new BadRequestException('Cancelled hospital stay cannot be discharged');
    }

    const visit = await this.prisma.visit.update({
      where: { id: existing.id },
      data: {
        status: VisitStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: hospitalVisitInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.discharge',
      entityType: 'Visit',
      entityId: visitId,
    });

    return visit;
  }

  async cancel(visitId: string, actorId: string) {
    const existing = await this.getExistingHospitalStay(visitId);

    const visit = await this.prisma.visit.update({
      where: { id: existing.id },
      data: {
        status: VisitStatus.CANCELLED,
        completedAt: new Date(),
      },
      include: hospitalVisitInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'hospital.cancel',
      entityType: 'Visit',
      entityId: visitId,
    });

    return visit;
  }

  private async getExistingHospitalStay(visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, hospitalBoxId: { not: null } },
      select: {
        id: true,
        status: true,
      },
    });

    if (!visit) {
      throw new NotFoundException('Hospital stay not found');
    }

    return visit;
  }
}

const hospitalVisitInclude = {
  owner: { select: { id: true, fullName: true, phone: true, extraPhone: true } },
  animal: { select: { id: true, nickname: true, species: true, breed: true, sex: true, status: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  hospitalBox: { select: { id: true, name: true, officeId: true } },
  exam: true,
  recommendation: true,
  bill: { select: { id: true, status: true, totalAmount: true, paidAmount: true } },
} satisfies Prisma.VisitInclude;

const hospitalRecordAuthorInclude = {
  recordedBy: { select: { id: true, fullName: true, position: true } },
} satisfies Prisma.HospitalRecordInclude;

const hospitalStayCardInclude = {
  ...hospitalVisitInclude,
  hospitalRecords: {
    orderBy: { recordedAt: 'desc' as const },
    include: hospitalRecordAuthorInclude,
  },
} satisfies Prisma.VisitInclude;
