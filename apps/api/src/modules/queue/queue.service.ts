import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AnimalSex, Prisma, QueueStatus, QueueUrgency, VisitStatus, VisitType } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { normalizeRussianPhone } from '../../common/phone';
import { AuditService } from '../audit/audit.service';
import { AnimalCatalogService } from '../animals/animal-catalog.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQueueEntryDto } from './dto/create-queue-entry.dto';
import { ListQueueQueryDto } from './dto/list-queue-query.dto';
import { UpdateQueueEntryDto } from './dto/update-queue-entry.dto';

const QUEUE_ACCEPT_DELAY_MS = 10_000;

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly animalCatalogService: AnimalCatalogService,
    private readonly schedulingService: SchedulingService,
  ) {}

  async listQueue(query: ListQueueQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const filters: Prisma.QueueEntryWhereInput[] = [];

    if (query.status === QueueStatus.COMPLETED) {
      filters.push({
        OR: [
          { visit: null },
          { visit: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] } } },
        ],
      });
    }

    if (search) {
      filters.push({
        OR: [
          { ownerName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { ownerAddress: { contains: search, mode: 'insensitive' } },
          { animalNickname: { contains: search, mode: 'insensitive' } },
          { owner: { fullName: { contains: search, mode: 'insensitive' } } },
          { owner: { phone: { contains: search, mode: 'insensitive' } } },
          { animal: { nickname: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.QueueEntryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.urgency ? { urgency: query.urgency } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lt: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(filters.length ? { AND: filters } : {}),
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

  async getQueueScreen() {
    const [waiting, called] = await this.prisma.$transaction([
      this.prisma.queueEntry.findMany({
        where: { status: QueueStatus.WAITING },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: queueScreenSelect,
      }),
      this.prisma.queueEntry.findMany({
        where: { status: QueueStatus.IN_PROGRESS },
        orderBy: [{ lastCalledAt: 'desc' }, { startedAt: 'desc' }, { createdAt: 'asc' }],
        take: 20,
        select: queueScreenSelect,
      }),
    ]);

    return {
      waiting: waiting.map(toQueueScreenItem),
      called: called.map(toQueueScreenItem),
    };
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
    const existing = await this.prisma.queueEntry.findUnique({
      where: { id: queueEntryId },
      select: { id: true, status: true, startedAt: true, callCount: true },
    });

    if (!existing) {
      throw new NotFoundException('Queue entry not found');
    }

    if (existing.status === QueueStatus.COMPLETED || existing.status === QueueStatus.CANCELLED) {
      throw new BadRequestException('Нельзя вызвать запись: пациент уже направлен на приём или очередь отменена');
    }

    const calledAt = new Date();
    const action = existing.status === QueueStatus.IN_PROGRESS ? 'queue.call' : 'queue.start';
    const queueEntry = await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data: {
        status: QueueStatus.IN_PROGRESS,
        startedAt: existing.startedAt ?? calledAt,
        lastCalledAt: calledAt,
        callCount: { increment: 1 },
        completedAt: null,
      },
      include: queueEntryInclude,
    });

    await this.auditService.log({
      actorId,
      action,
      entityType: 'QueueEntry',
      entityId: queueEntry.id,
      metadata: {
        status: queueEntry.status,
        callCount: queueEntry.callCount,
        lastCalledAt: queueEntry.lastCalledAt,
      },
    });

    return queueEntry;
  }

  async completeQueueEntry(queueEntryId: string, actorId: string) {
    const queueEntry = await this.prisma.queueEntry.findUnique({
      where: { id: queueEntryId },
      select: { id: true, status: true, startedAt: true, lastCalledAt: true },
    });

    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }

    if (queueEntry.status !== QueueStatus.IN_PROGRESS || !queueEntry.startedAt) {
      throw new BadRequestException('Сначала вызовите клиента на приём');
    }

    const lastCallAt = queueEntry.lastCalledAt ?? queueEntry.startedAt;
    const acceptAllowedAt = lastCallAt.getTime() + QUEUE_ACCEPT_DELAY_MS;
    if (Date.now() < acceptAllowedAt) {
      const secondsLeft = Math.ceil((acceptAllowedAt - Date.now()) / 1000);
      throw new BadRequestException(`Начать приём можно через ${secondsLeft} сек.`);
    }

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

    if (options.requireClient) {
      const hasLinkedPatient = Boolean(ownerId && dto.animalId);
      const hasIntakeOwner = Boolean(dto.ownerName?.trim() || dto.phone?.trim());
      const hasIntakeAnimal = Boolean(dto.animalNickname?.trim());
      const hasIntakeAnimalCatalog = Boolean(dto.animalSpecies?.trim() && dto.animalBreed?.trim());

      if (!hasLinkedPatient && (!hasIntakeOwner || !hasIntakeAnimal || !hasIntakeAnimalCatalog)) {
        throw new BadRequestException('Queue entry must have existing owner and animal or intake owner and animal data');
      }
    }

    if (!dto.animalId && (dto.animalSpecies !== undefined || dto.animalBreed !== undefined)) {
      await this.animalCatalogService.validateSelection(dto.animalSpecies, dto.animalBreed);
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
      phone: dto.phone !== undefined ? normalizeRussianPhone(dto.phone) : undefined,
      ownerAddress: dto.ownerAddress,
      animalNickname: dto.animalNickname,
      animalSpecies: dto.animalSpecies,
      animalBreed: dto.animalBreed,
      animalSex: dto.animalSex,
      visitType: dto.visitType,
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
    select: { id: true, fullName: true, phone: true, extraPhone: true, address: true },
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
} satisfies Prisma.QueueEntryInclude;

const queueScreenSelect = {
  id: true,
  ownerName: true,
  animalNickname: true,
  animalSpecies: true,
  urgency: true,
  status: true,
  createdAt: true,
  startedAt: true,
  lastCalledAt: true,
  callCount: true,
  owner: {
    select: { fullName: true },
  },
  animal: {
    select: { nickname: true, species: true },
  },
  employee: {
    select: { fullName: true },
  },
  room: {
    select: { name: true },
  },
} satisfies Prisma.QueueEntrySelect;

type QueueScreenRecord = Prisma.QueueEntryGetPayload<{ select: typeof queueScreenSelect }>;

function toQueueScreenItem(item: QueueScreenRecord) {
  return {
    id: item.id,
    clientSurname: getClientSurname(item.owner?.fullName ?? item.ownerName),
    animalName: item.animal?.nickname ?? item.animalNickname ?? 'Пациент',
    animalSpecies: item.animal?.species ?? item.animalSpecies ?? null,
    roomName: item.room?.name ?? null,
    employeeName: getEmployeePublicName(item.employee?.fullName),
    urgency: item.urgency,
    status: item.status,
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    lastCalledAt: item.lastCalledAt,
    callCount: item.callCount,
  };
}

function getClientSurname(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || 'Клиент';
}

function resolveQueueStatusData(status?: QueueStatus): Prisma.QueueEntryUncheckedUpdateInput {
  if (!status) {
    return {};
  }

  const calledAt = new Date();

  return {
    status,
    ...(status === QueueStatus.IN_PROGRESS
      ? { startedAt: calledAt, lastCalledAt: calledAt, callCount: { increment: 1 } }
      : {}),
    ...(status === QueueStatus.COMPLETED || status === QueueStatus.CANCELLED ? { completedAt: new Date() } : {}),
  };
}

function getEmployeePublicName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || null;
}

type QueueMutationData = {
  officeId?: string;
  ownerId?: string;
  animalId?: string;
  employeeId?: string;
  roomId?: string;
  ownerName?: string;
  phone?: string | null;
  ownerAddress?: string;
  animalNickname?: string;
  animalSpecies?: string;
  animalBreed?: string;
  animalSex?: AnimalSex;
  visitType?: VisitType;
  urgency?: QueueUrgency;
  comment?: string;
};
