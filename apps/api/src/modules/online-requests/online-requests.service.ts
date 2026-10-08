import { ClinicConversationSyncService } from './clinic-conversation-sync.service';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OnlineRequestStatus, Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { withRussianSearchVariants } from '../../common/search-ranking';
import { normalizeRussianPhone } from '../../common/phone';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AcceptOnlineRequestDto } from './dto/accept-online-request.dto';
import { CreateOnlineRequestDto } from './dto/create-online-request.dto';
import { ListOnlineRequestsQueryDto } from './dto/list-online-requests-query.dto';
import { lockOnlineRequest } from './online-request-attention.service';
import { UpdateOnlineRequestDto } from './dto/update-online-request.dto';

@Injectable()
export class OnlineRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
    private readonly appointmentsService: AppointmentsService,
    private readonly conversations: ClinicConversationSyncService,
  ) {}

  async listRequests(query: ListOnlineRequestsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.OnlineAppointmentRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: withRussianSearchVariants(search, (variant) => [
              { ownerName: { contains: variant, mode: 'insensitive' as const } },
              { phone: { contains: variant, mode: 'insensitive' as const } },
              { email: { contains: variant, mode: 'insensitive' as const } },
              { animalNickname: { contains: variant, mode: 'insensitive' as const } },
              { animalSpecies: { contains: variant, mode: 'insensitive' as const } },
              { animalBreed: { contains: variant, mode: 'insensitive' as const } },
              { comment: { contains: variant, mode: 'insensitive' as const } },
            ]),
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.onlineAppointmentRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: onlineRequestInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.onlineAppointmentRequest.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async createRequest(dto: CreateOnlineRequestDto) {
    if (dto.website?.trim()) throw new BadRequestException('Не удалось отправить сообщение');
    if (!/^\+?[0-9 ()-]{10,32}$/.test(dto.phone.trim()) || dto.phone.replace(/\D/g, '').length < 10 || dto.phone.replace(/\D/g, '').length > 15) throw new BadRequestException('Укажите телефон: от 10 до 15 цифр');
    const preferredAt = dto.preferredAt ? new Date(dto.preferredAt) : null;
    if (preferredAt && Number.isNaN(preferredAt.getTime())) {
      throw new BadRequestException('Укажите корректную дату записи');
    }

    const request = await this.prisma.onlineAppointmentRequest.create({
      data: {
        ownerName: required(dto.ownerName, 'Укажите имя владельца'),
        phone: normalizeRussianPhone(required(dto.phone, 'Укажите телефон'))!,
        email: emptyToNull(dto.email),
        animalNickname: required(dto.animalNickname, 'Укажите кличку пациента'),
        animalSpecies: emptyToNull(dto.animalSpecies),
        animalBreed: emptyToNull(dto.animalBreed),
        preferredAt,
        comment: emptyToNull(dto.comment),
        source: emptyToNull(dto.source) ?? 'PUBLIC_FORM',
      },
      include: onlineRequestInclude,
    });

    await this.auditService.log({
      action: 'online_request.create',
      entityType: 'OnlineAppointmentRequest',
      entityId: request.id,
      metadata: { source: request.source, ownerName: request.ownerName, phone: request.phone },
    });

    return request;
  }

  async getRequest(requestId: string) {
    const request = await this.prisma.onlineAppointmentRequest.findUnique({
      where: { id: requestId },
      include: onlineRequestInclude,
    });

    if (!request) {
      throw new NotFoundException('Онлайн-заявка не найдена');
    }

    return request;
  }

  async updateRequest(requestId: string, dto: UpdateOnlineRequestDto, actorId: string) {
    await this.validateLinks(dto.ownerId, dto.animalId);
    if (dto.status === OnlineRequestStatus.ACCEPTED) throw new BadRequestException('Подтвердите время через действие «Подтвердить»');

    const request = await this.prisma.$transaction(async (tx) => {
      await lockOnlineRequest(tx, requestId);
      const current = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: requestId } });
      assertAssignee(current.assignedEmployeeId, actorId);
      if (current.status !== 'NEW' && current.status !== 'IN_REVIEW' && dto.status && dto.status !== current.status) {
        throw new ConflictException('Обработанную заявку нельзя вернуть в работу');
      }
      if (dto.status === 'NEW' || dto.status === 'IN_REVIEW') await tx.onlineRequestSnooze.deleteMany({ where: { requestId } });
      return tx.onlineAppointmentRequest.update({
      where: { id: requestId },
      data: {
        ...(dto.status === 'IN_REVIEW' ? { assignedEmployeeId: actorId, claimedAt: current.claimedAt ?? new Date() } : {}),
        ...(dto.status === 'NEW' ? { assignedEmployeeId: null, claimedAt: null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.ownerName !== undefined ? { ownerName: required(dto.ownerName, 'Укажите имя владельца') } : {}),
        ...(dto.phone !== undefined ? { phone: normalizeRussianPhone(required(dto.phone, 'Укажите телефон'))! } : {}),
        ...(dto.email !== undefined ? { email: emptyToNull(dto.email) } : {}),
        ...(dto.animalNickname !== undefined ? { animalNickname: required(dto.animalNickname, 'Укажите кличку пациента') } : {}),
        ...(dto.animalSpecies !== undefined ? { animalSpecies: emptyToNull(dto.animalSpecies) } : {}),
        ...(dto.animalBreed !== undefined ? { animalBreed: emptyToNull(dto.animalBreed) } : {}),
        ...(dto.preferredAt !== undefined ? { preferredAt: dto.preferredAt ? new Date(dto.preferredAt) : null } : {}),
        ...(dto.comment !== undefined ? { comment: emptyToNull(dto.comment) } : {}),
        ...(dto.internalComment !== undefined ? { internalComment: emptyToNull(dto.internalComment) } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
        ...(dto.animalId !== undefined ? { animalId: dto.animalId } : {}),
      },
      include: onlineRequestInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'online_request.update',
      entityType: 'OnlineAppointmentRequest',
      entityId: request.id,
      metadata: { changedFields: Object.keys(dto), status: request.status },
    });

    return request;
  }

  async acceptRequest(requestId: string, dto: AcceptOnlineRequestDto, actorId: string) {
    const preview = await this.getRequest(requestId);
    if (preview.source === 'OWNER_GATEWAY' && /^(Отмена|Перенос) записи от .+ \(№ [^)]+\)\./.test(preview.comment ?? '')) {
      throw new BadRequestException('Это обращение об изменении существующей записи. Обработайте его в расписании и закройте заявку; создавать новую запись не нужно.');
    }
    return this.prisma.$transaction(async tx => {
    await lockOnlineRequest(tx, requestId);
    const request = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: requestId }, include: onlineRequestInclude });
    assertAssignee(request.assignedEmployeeId, actorId);
    if (request.appointmentId) {
      return request;
    }

    if (request.status === OnlineRequestStatus.CANCELLED || request.status === OnlineRequestStatus.ARCHIVED) {
      throw new BadRequestException('Отменённую или архивную заявку нельзя принять');
    }

    await this.validateLinks(dto.ownerId, dto.animalId);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : request.preferredAt;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Укажите дату и время записи');
    }

    const appointment = await this.appointmentsService.createAppointmentInTransaction(
      tx,
      {
        officeId: dto.officeId,
        ownerId: dto.ownerId,
        animalId: dto.animalId,
        employeeId: dto.employeeId,
        roomId: dto.roomId,
        startsAt: startsAt.toISOString(),
        endsAt: dto.endsAt,
        comment: dto.comment ?? request.comment ?? undefined,
      },
      actorId,
    );

    const updatedRequest = await tx.onlineAppointmentRequest.update({
      where: { id: request.id },
      data: {
        status: OnlineRequestStatus.ACCEPTED,
        assignedEmployeeId: actorId,
        claimedAt: request.claimedAt ?? new Date(),
        ownerId: dto.ownerId,
        animalId: dto.animalId,
        appointmentId: appointment.id,
        preferredAt: startsAt,
      },
      include: onlineRequestInclude,
    });

    await this.conversations?.queueConfirmation(tx, request, appointment);
    await this.auditService.log({
      actorId,
      action: 'online_request.accept',
      entityType: 'OnlineAppointmentRequest',
      entityId: request.id,
      metadata: { appointmentId: appointment.id, ownerId: dto.ownerId, animalId: dto.animalId },
    }, tx);

    return updatedRequest;
    });
  }

  async setRequestStatus(requestId: string, status: OnlineRequestStatus, actorId: string) {
    const request = await this.prisma.$transaction(async (tx) => {
      await lockOnlineRequest(tx, requestId);
      const current = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: requestId } });
      assertAssignee(current.assignedEmployeeId, actorId);
      return tx.onlineAppointmentRequest.update({ where: { id: requestId }, data: { status, conversationNeedsAttention: false }, include: onlineRequestInclude });
    });

    await this.auditService.log({
      actorId,
      action: `online_request.${status.toLowerCase()}`,
      entityType: 'OnlineAppointmentRequest',
      entityId: request.id,
      metadata: { status },
    });

    return request;
  }

  private async validateLinks(ownerId?: string, animalId?: string) {
    if (ownerId) {
      await this.schedulingService.ensureOwnerExists(ownerId);
    }

    if (animalId) {
      await this.schedulingService.resolveAnimalOwner(animalId, ownerId);
    }
  }
}

const onlineRequestInclude = {
  assignedEmployee: { select: { id: true, fullName: true, status: true } },
  owner: { select: { id: true, fullName: true, phone: true } },
  animal: { select: { id: true, nickname: true, species: true, breed: true } },
  appointment: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      employee: { select: { id: true, fullName: true } },
      room: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.OnlineAppointmentRequestInclude;

function required(value: string | null | undefined, message: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException(message);
  }
  return normalized;
}

function emptyToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function assertAssignee(assignedEmployeeId: string | null, actorId: string) {
  if (assignedEmployeeId && assignedEmployeeId !== actorId) throw new ConflictException('Заявку уже обрабатывает другой сотрудник');
}
