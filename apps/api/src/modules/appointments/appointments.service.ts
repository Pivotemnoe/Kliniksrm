import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { withRussianSearchVariants } from '../../common/search-ranking';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { cancelAppointmentReminders } from '../notifications/assistant-reminder.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
  ) {}

  async listAppointments(query: ListAppointmentsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.AppointmentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            startsAt: {
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
              { comment: { contains: variant, mode: 'insensitive' as const } },
            ]),
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        include: appointmentInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async createAppointment(dto: CreateAppointmentDto, actorId: string) {
    return this.prisma.$transaction(tx => this.createAppointmentInTransaction(tx, dto, actorId));
  }

  // Shared by request confirmation: appointment, request and audit commit together.
  async createAppointmentInTransaction(tx: Prisma.TransactionClient, dto: CreateAppointmentDto, actorId?: string) {
    await lockAppointmentSchedule(tx);
    const data = await this.resolveAppointmentData(dto, undefined, tx);
    await this.ensureEmployeeIsAvailable({
      employeeId: data.employeeId,
      roomId: data.roomId,
      startsAt: data.startsAt!,
      endsAt: data.endsAt,
    }, undefined, tx);

    const appointment = await tx.appointment.create({
      data: data as Prisma.AppointmentUncheckedCreateInput,
      include: appointmentInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'appointment.create',
      entityType: 'Appointment',
      entityId: appointment.id,
      metadata: {
        ownerId: appointment.ownerId,
        animalId: appointment.animalId,
        employeeId: appointment.employeeId,
        startsAt: appointment.startsAt,
        status: appointment.status,
      },
    }, tx);

    return appointment;
  }

  async getAppointment(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: appointmentInclude,
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async updateAppointment(appointmentId: string, dto: UpdateAppointmentDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
    await lockAppointmentSchedule(tx);
    const existing = await this.getExistingAppointment(appointmentId, tx);
    const data = await this.resolveAppointmentData(dto, existing, tx);

    if (isActiveAppointment(data.status ?? existing.status)) await this.ensureEmployeeIsAvailable(
      {
        employeeId: data.employeeId !== undefined ? data.employeeId : existing.employeeId,
        roomId: data.roomId !== undefined ? data.roomId : existing.roomId,
        startsAt: data.startsAt ?? existing.startsAt,
        endsAt: data.endsAt !== undefined ? data.endsAt : existing.endsAt,
      },
      appointmentId,
      tx,
    );

    const appointment = await tx.appointment.update({
      where: { id: appointmentId },
      data: data as Prisma.AppointmentUncheckedUpdateInput,
      include: appointmentInclude,
    });
    if (['ownerId', 'animalId', 'officeId', 'employeeId', 'roomId', 'startsAt', 'endsAt', 'status'].some(key => String((appointment as unknown as Record<string, unknown>)[key]) !== String((existing as unknown as Record<string, unknown>)[key]))) await cancelAppointmentReminders(tx, appointmentId);

    await this.auditService.log({
      actorId,
      action: 'appointment.update',
      entityType: 'Appointment',
      entityId: appointment.id,
      metadata: { changedFields: Object.keys(dto), status: appointment.status },
    }, tx);

    return appointment;
    });
  }

  async arriveAppointment(appointmentId: string, actorId: string) {
    return this.setStatus(appointmentId, AppointmentStatus.ARRIVED, actorId, 'appointment.arrive');
  }

  async startAppointment(appointmentId: string, actorId: string) {
    return this.setStatus(appointmentId, AppointmentStatus.IN_PROGRESS, actorId, 'appointment.start');
  }

  async completeAppointment(appointmentId: string, actorId: string) {
    return this.setStatus(appointmentId, AppointmentStatus.COMPLETED, actorId, 'appointment.complete');
  }

  async cancelAppointment(appointmentId: string, actorId: string) {
    return this.setStatus(appointmentId, AppointmentStatus.CANCELLED, actorId, 'appointment.cancel');
  }

  private async setStatus(appointmentId: string, status: AppointmentStatus, actorId: string, action: string) {
    return this.prisma.$transaction(async tx => {
    await lockAppointmentSchedule(tx);
    const existing = await this.getExistingAppointment(appointmentId, tx);
    if (isActiveAppointment(status)) {
      await this.ensureEmployeeIsAvailable(existing, appointmentId, tx);
    }

    const appointment = await tx.appointment.update({
      where: { id: appointmentId },
      data: { status },
      include: appointmentInclude,
    });
    if (existing.status !== status) await cancelAppointmentReminders(tx, appointmentId);

    await this.auditService.log({
      actorId,
      action,
      entityType: 'Appointment',
      entityId: appointment.id,
      metadata: { status },
    }, tx);

    return appointment;
    });
  }

  private async resolveAppointmentData(
    dto: CreateAppointmentDto | UpdateAppointmentDto,
    existing?: ExistingAppointment,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<AppointmentMutationData> {
    const ownerId = dto.ownerId ?? existing?.ownerId;
    const animalId = dto.animalId ?? existing?.animalId;

    if (!ownerId || !animalId) {
      throw new BadRequestException('Appointment must have owner and animal');
    }

    await this.schedulingService.ensureOwnerExists(ownerId, db);
    const resolvedOwnerId = await this.schedulingService.resolveAnimalOwner(animalId, ownerId, {
      allowArchived: Boolean(existing && animalId === existing.animalId),
    }, db);

    const room = dto.roomId ? await this.schedulingService.ensureRoomExists(dto.roomId, db) : undefined;
    const officeId = dto.officeId ?? room?.officeId ?? (existing ? undefined : await this.schedulingService.getDefaultOfficeId(db));

    if (officeId) {
      await this.schedulingService.ensureOfficeExists(officeId, db);
    }

    if (room && officeId && room.officeId !== officeId) {
      throw new BadRequestException('Room does not belong to clinic office');
    }

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId, db);
    }

    const startsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : existing?.startsAt;
    const endsAt =
      dto.endsAt !== undefined ? new Date(dto.endsAt) : (existing?.endsAt ?? addMinutes(startsAt, DEFAULT_APPOINTMENT_MINUTES));

    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Appointment must have valid start time');
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Appointment must have valid end time');
    }

    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('Appointment end time must be after start time');
    }

    return {
      ...(existing ? {} : { officeId }),
      ...(dto.officeId !== undefined || (dto.roomId !== undefined && room) ? { officeId } : {}),
      ...(dto.ownerId !== undefined || !existing ? { ownerId: resolvedOwnerId } : {}),
      ...(dto.animalId !== undefined || !existing ? { animalId } : {}),
      ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
      ...(dto.roomId !== undefined ? { roomId: dto.roomId } : {}),
      ...(dto.startsAt !== undefined || !existing ? { startsAt } : {}),
      ...(dto.endsAt !== undefined || !existing ? { endsAt } : {}),
      ...('status' in dto && dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
    };
  }

  private async ensureEmployeeIsAvailable(
    data: AppointmentAvailabilityData,
    appointmentIdToIgnore?: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (!data.employeeId && !data.roomId) {
      return;
    }

    const startsAt = data.startsAt;
    const endsAt = data.endsAt ?? addMinutes(startsAt, DEFAULT_APPOINTMENT_MINUTES);

    const overlappingAppointment = await db.appointment.findFirst({
      where: {
        AND: [{ OR: [
          ...(data.employeeId ? [{ employeeId: data.employeeId }] : []),
          ...(data.roomId ? [{ roomId: data.roomId }] : []),
        ] }],
        ...(appointmentIdToIgnore ? { id: { not: appointmentIdToIgnore } } : {}),
        status: { in: [AppointmentStatus.PLANNED, AppointmentStatus.ARRIVED, AppointmentStatus.IN_PROGRESS] },
        startsAt: { lt: endsAt },
        OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    if (overlappingAppointment) {
      throw new BadRequestException('Врач или кабинет уже занят в это время');
    }
  }

  private async getExistingAppointment(appointmentId: string, db: Prisma.TransactionClient = this.prisma) {
    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        officeId: true,
        ownerId: true,
        animalId: true,
        employeeId: true,
        roomId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        comment: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }
}

const DEFAULT_APPOINTMENT_MINUTES = 30;

const appointmentInclude = {
  office: {
    select: { id: true, name: true, timezone: true },
  },
  owner: {
    select: { id: true, fullName: true, phone: true, extraPhone: true },
  },
  animal: {
    select: { id: true, nickname: true, species: true, breed: true, sex: true, birthDate: true, status: true },
  },
  employee: {
    select: { id: true, fullName: true, position: true },
  },
  room: {
    select: { id: true, name: true },
  },
  visit: {
    select: { id: true, status: true, startedAt: true, totalAmount: true },
  },
} satisfies Prisma.AppointmentInclude;

type ExistingAppointment = Prisma.AppointmentGetPayload<{
  select: {
    id: true;
    officeId: true;
    ownerId: true;
    animalId: true;
    employeeId: true;
    roomId: true;
    startsAt: true;
    endsAt: true;
    status: true;
    comment: true;
  };
}>;

type AppointmentAvailabilityData = {
  employeeId?: string | null;
  roomId?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
};

type AppointmentMutationData = {
  officeId?: string;
  ownerId?: string;
  animalId?: string;
  employeeId?: string;
  roomId?: string;
  startsAt?: Date;
  endsAt?: Date;
  status?: AppointmentStatus;
  comment?: string;
};

function addMinutes(date: Date | undefined, minutes: number) {
  if (!date) {
    return undefined;
  }

  return new Date(date.getTime() + minutes * 60 * 1000);
}

// One short transaction at a time for schedule writes, including manual edits.
// This prevents check-then-insert races for overlapping intervals.
async function lockAppointmentSchedule(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, 1)`;
}

function isActiveAppointment(status: AppointmentStatus) {
  return status === AppointmentStatus.PLANNED || status === AppointmentStatus.ARRIVED || status === AppointmentStatus.IN_PROGRESS;
}
