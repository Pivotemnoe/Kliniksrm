import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

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
            OR: [
              { owner: { fullName: { contains: search, mode: 'insensitive' } } },
              { owner: { phone: { contains: search, mode: 'insensitive' } } },
              { animal: { nickname: { contains: search, mode: 'insensitive' } } },
              { comment: { contains: search, mode: 'insensitive' } },
            ],
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
    const data = await this.resolveAppointmentData(dto);
    await this.ensureEmployeeIsAvailable({
      employeeId: data.employeeId,
      startsAt: data.startsAt!,
      endsAt: data.endsAt,
    });

    const appointment = await this.prisma.appointment.create({
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
    });

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
    const existing = await this.getExistingAppointment(appointmentId);
    const data = await this.resolveAppointmentData(dto, existing);

    await this.ensureEmployeeIsAvailable(
      {
        employeeId: data.employeeId !== undefined ? data.employeeId : existing.employeeId,
        startsAt: data.startsAt ?? existing.startsAt,
        endsAt: data.endsAt !== undefined ? data.endsAt : existing.endsAt,
      },
      appointmentId,
    );

    const appointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: data as Prisma.AppointmentUncheckedUpdateInput,
      include: appointmentInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'appointment.update',
      entityType: 'Appointment',
      entityId: appointment.id,
      metadata: { changedFields: Object.keys(dto), status: appointment.status },
    });

    return appointment;
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
    await this.getExistingAppointment(appointmentId);

    const appointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status },
      include: appointmentInclude,
    });

    await this.auditService.log({
      actorId,
      action,
      entityType: 'Appointment',
      entityId: appointment.id,
      metadata: { status },
    });

    return appointment;
  }

  private async resolveAppointmentData(
    dto: CreateAppointmentDto | UpdateAppointmentDto,
    existing?: ExistingAppointment,
  ): Promise<AppointmentMutationData> {
    const ownerId = dto.ownerId ?? existing?.ownerId;
    const animalId = dto.animalId ?? existing?.animalId;

    if (!ownerId || !animalId) {
      throw new BadRequestException('Appointment must have owner and animal');
    }

    await this.schedulingService.ensureOwnerExists(ownerId);
    const resolvedOwnerId = await this.schedulingService.resolveAnimalOwner(animalId, ownerId);

    const room = dto.roomId ? await this.schedulingService.ensureRoomExists(dto.roomId) : undefined;
    const officeId = dto.officeId ?? room?.officeId ?? (existing ? undefined : await this.schedulingService.getDefaultOfficeId());

    if (officeId) {
      await this.schedulingService.ensureOfficeExists(officeId);
    }

    if (room && officeId && room.officeId !== officeId) {
      throw new BadRequestException('Room does not belong to clinic office');
    }

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
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
  ) {
    if (!data.employeeId) {
      return;
    }

    const startsAt = data.startsAt;
    const endsAt = data.endsAt ?? addMinutes(startsAt, DEFAULT_APPOINTMENT_MINUTES);

    const overlappingAppointment = await this.prisma.appointment.findFirst({
      where: {
        employeeId: data.employeeId,
        ...(appointmentIdToIgnore ? { id: { not: appointmentIdToIgnore } } : {}),
        status: { in: [AppointmentStatus.PLANNED, AppointmentStatus.ARRIVED, AppointmentStatus.IN_PROGRESS] },
        startsAt: { lt: endsAt },
        OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    if (overlappingAppointment) {
      throw new BadRequestException('Employee already has appointment at this time');
    }
  }

  private async getExistingAppointment(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
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
    select: { id: true, nickname: true, species: true, breed: true, sex: true, status: true },
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
