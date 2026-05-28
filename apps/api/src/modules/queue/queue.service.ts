import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QueueStatus, QueueUrgency } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQueueEntryDto } from './dto/create-queue-entry.dto';
import { ListQueueQueryDto } from './dto/list-queue-query.dto';
import { UpdateQueueEntryDto } from './dto/update-queue-entry.dto';

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
  ) {}

  async listQueue(query: ListQueueQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.QueueEntryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.urgency ? { urgency: query.urgency } : {}),
      ...(search
        ? {
            OR: [
              { ownerName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { owner: { fullName: { contains: search, mode: 'insensitive' } } },
              { owner: { phone: { contains: search, mode: 'insensitive' } } },
              { animal: { nickname: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.queueEntry.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: queueEntryInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.queueEntry.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async createQueueEntry(dto: CreateQueueEntryDto, actorId: string) {
    const data = await this.resolveQueueData(dto, { requireClient: true });

    const queueEntry = await this.prisma.queueEntry.create({
      data: data as Prisma.QueueEntryUncheckedCreateInput,
      include: queueEntryInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'queue.create',
      entityType: 'QueueEntry',
      entityId: queueEntry.id,
      metadata: {
        ownerId: queueEntry.ownerId,
        animalId: queueEntry.animalId,
        employeeId: queueEntry.employeeId,
        roomId: queueEntry.roomId,
        status: queueEntry.status,
      },
    });

    return queueEntry;
  }

  async getQueueEntry(queueEntryId: string) {
    const queueEntry = await this.prisma.queueEntry.findUnique({
      where: { id: queueEntryId },
      include: queueEntryInclude,
    });

    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }

    return queueEntry;
  }

  async updateQueueEntry(queueEntryId: string, dto: UpdateQueueEntryDto, actorId: string) {
    await this.ensureQueueEntryExists(queueEntryId);
    const data = await this.resolveQueueData(dto, { requireClient: false });
    const statusData = resolveQueueStatusData(dto.status);

    const queueEntry = await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data: {
        ...data,
        ...statusData,
      },
      include: queueEntryInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'queue.update',
      entityType: 'QueueEntry',
      entityId: queueEntry.id,
      metadata: { changedFields: Object.keys(dto), status: queueEntry.status },
    });

    return queueEntry;
  }

  async startQueueEntry(queueEntryId: string, actorId: string) {
    return this.setStatus(queueEntryId, QueueStatus.IN_PROGRESS, actorId, 'queue.start');
  }

  async completeQueueEntry(queueEntryId: string, actorId: string) {
    return this.setStatus(queueEntryId, QueueStatus.COMPLETED, actorId, 'queue.complete');
  }

  async cancelQueueEntry(queueEntryId: string, actorId: string) {
    return this.setStatus(queueEntryId, QueueStatus.CANCELLED, actorId, 'queue.cancel');
  }

  private async setStatus(queueEntryId: string, status: QueueStatus, actorId: string, action: string) {
    await this.ensureQueueEntryExists(queueEntryId);

    const queueEntry = await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data: resolveQueueStatusData(status),
      include: queueEntryInclude,
    });

    await this.auditService.log({
      actorId,
      action,
      entityType: 'QueueEntry',
      entityId: queueEntry.id,
      metadata: { status },
    });

    return queueEntry;
  }

  private async resolveQueueData(
    dto: CreateQueueEntryDto | UpdateQueueEntryDto,
    options: { requireClient: boolean },
  ): Promise<QueueMutationData> {
    if ('ownerId' in dto && dto.ownerId) {
      await this.schedulingService.ensureOwnerExists(dto.ownerId);
    }

    let ownerId = dto.ownerId;

    if ('animalId' in dto && dto.animalId) {
      ownerId = await this.schedulingService.resolveAnimalOwner(dto.animalId, dto.ownerId);
    }

    if (options.requireClient && !ownerId && !dto.ownerName?.trim() && !dto.phone?.trim()) {
      throw new BadRequestException('Queue entry must have existing owner or primary owner name/phone');
    }

    if (dto.employeeId) {
      await this.schedulingService.ensureEmployeeActive(dto.employeeId);
    }

    const room = dto.roomId ? await this.schedulingService.ensureRoomExists(dto.roomId) : undefined;
    const officeId =
      dto.officeId ?? room?.officeId ?? (options.requireClient ? await this.schedulingService.getDefaultOfficeId() : undefined);

    if (officeId) {
      await this.schedulingService.ensureOfficeExists(officeId);
    }

    if (room && officeId && room.officeId !== officeId) {
      throw new BadRequestException('Room does not belong to clinic office');
    }

    return {
      officeId,
      ownerId,
      animalId: dto.animalId,
      employeeId: dto.employeeId,
      roomId: dto.roomId,
      ownerName: dto.ownerName,
      phone: dto.phone,
      urgency: dto.urgency,
      comment: dto.comment,
    };
  }

  private async ensureQueueEntryExists(queueEntryId: string) {
    const queueEntry = await this.prisma.queueEntry.findUnique({
      where: { id: queueEntryId },
      select: { id: true },
    });

    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }
  }
}

const queueEntryInclude = {
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
} satisfies Prisma.QueueEntryInclude;

function resolveQueueStatusData(status?: QueueStatus): Prisma.QueueEntryUncheckedUpdateInput {
  if (!status) {
    return {};
  }

  return {
    status,
    ...(status === QueueStatus.IN_PROGRESS ? { startedAt: new Date() } : {}),
    ...(status === QueueStatus.COMPLETED || status === QueueStatus.CANCELLED ? { completedAt: new Date() } : {}),
  };
}

type QueueMutationData = {
  officeId?: string;
  ownerId?: string;
  animalId?: string;
  employeeId?: string;
  roomId?: string;
  ownerName?: string;
  phone?: string;
  urgency?: QueueUrgency;
  comment?: string;
};
