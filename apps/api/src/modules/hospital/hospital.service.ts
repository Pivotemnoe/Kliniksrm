import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillSource, PaymentStatus, Prisma, VisitStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AdmitHospitalPatientDto } from './dto/admit-hospital-patient.dto';
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
      include: hospitalVisitInclude,
    });

    if (!visit) {
      throw new NotFoundException('Hospital stay not found');
    }

    return visit;
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
