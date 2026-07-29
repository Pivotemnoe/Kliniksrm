import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  BillSource,
  HospitalStayStatus,
  PaymentStatus,
  Prisma,
  QueueStatus,
  VisitStatus,
} from '@prisma/client';
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

    const record = await this.prisma.hospitalRecord.create({
      data: {
        visitId: stay.sourceVisitId,
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
      metadata: { stayId: stay.id, sourceVisitId: stay.sourceVisitId, recordType: dto.recordType },
    });

    return record;
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
        status: true,
        startedAt: true,
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
    const dueAt = await this.financeService.getDefaultBillDueAt();
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

      await tx.bill.create({
        data: {
          ownerId,
          animalId: dto.animalId,
          visitId: sourceVisit.id,
          source: BillSource.VISIT,
          status: PaymentStatus.UNPAID,
          dueAt,
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

    await this.prisma.hospitalStay.update({
      where: { id: existing.id },
      data: { status: HospitalStayStatus.DISCHARGED, completedAt: new Date() },
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

  private async getExistingHospitalStay(stayId: string) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { OR: [{ id: stayId }, { sourceVisitId: stayId }] },
      select: { id: true, sourceVisitId: true, status: true },
    });

    if (!stay) {
      throw new NotFoundException('Госпитализация не найдена');
    }

    return stay;
  }
}

const hospitalRecordAuthorInclude = {
  recordedBy: { select: { id: true, fullName: true, position: true } },
} satisfies Prisma.HospitalRecordInclude;

const hospitalStayInclude = {
  owner: { select: { id: true, fullName: true, phone: true, extraPhone: true } },
  animal: { select: { id: true, nickname: true, species: true, breed: true, sex: true, status: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  hospitalBox: { select: { id: true, name: true, officeId: true } },
  sourceVisit: {
    include: {
      exam: true,
      recommendation: true,
      bill: { select: { id: true, status: true, totalAmount: true, paidAmount: true } },
      hospitalRecords: {
        orderBy: { recordedAt: 'desc' as const },
        include: hospitalRecordAuthorInclude,
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
    hospitalBox: stay.hospitalBox,
    exam: stay.sourceVisit.exam,
    recommendation: stay.sourceVisit.recommendation,
    bill: stay.sourceVisit.bill,
    hospitalRecords: stay.sourceVisit.hospitalRecords,
  };
}
