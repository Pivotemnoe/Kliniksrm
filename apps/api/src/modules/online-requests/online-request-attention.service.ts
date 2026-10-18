import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const activeStatuses = ['NEW', 'IN_REVIEW'] as const;

@Injectable()
export class OnlineRequestAttentionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(employeeId: string) {
    const now = new Date();
    const where: Prisma.OnlineAppointmentRequestWhereInput = {
      deletedAt: null,
      OR: [{ status: { in: [...activeStatuses] } }, { conversationNeedsAttention: true }],
      AND: [
        { OR: [
          { assignedEmployeeId: null },
          { assignedEmployee: { status: 'BLOCKED' } },
          { assignedEmployeeId: employeeId, conversationNeedsAttention: true },
        ] },
        { snoozes: { none: { employeeId, until: { gt: now } } } },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.onlineAppointmentRequest.findMany({
        where, orderBy: [{ conversationNeedsAttention: 'desc' }, { claimedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { id: 'asc' }], take: 30,
        include: { assignedEmployee: { select: { id: true, fullName: true, status: true } } },
      }),
      this.prisma.onlineAppointmentRequest.count({ where }),
    ]);
    return { items, total, checkedAt: now, escalationMinutes: null };
  }

  async claim(requestId: string, employeeId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockOnlineRequest(tx, requestId);
      const request = await tx.onlineAppointmentRequest.findUniqueOrThrow({
        where: { id: requestId }, include: { assignedEmployee: true },
      });
      assertNotDeleted(request.deletedAt);
      if (!request.conversationNeedsAttention) assertRequestActive(request.status);
      if (request.assignedEmployeeId && request.assignedEmployeeId !== employeeId && request.assignedEmployee?.status !== 'BLOCKED') {
        throw new ConflictException(`Заявку уже обрабатывает ${request.assignedEmployee?.fullName ?? 'другой сотрудник'}`);
      }
      if (request.assignedEmployeeId === employeeId && !request.conversationNeedsAttention) return request;
      const updated = await tx.onlineAppointmentRequest.update({
        where: { id: requestId },
        data: { ...(activeStatuses.includes(request.status as 'NEW' | 'IN_REVIEW') ? { status: 'IN_REVIEW' as const } : {}), assignedEmployeeId: employeeId, claimedAt: new Date(), conversationNeedsAttention: false },
        include: { assignedEmployee: { select: { id: true, fullName: true, status: true } } },
      });
      await tx.onlineRequestSnooze.deleteMany({ where: { requestId } });
      await tx.auditLog.create({ data: {
        actorId: employeeId, action: 'online_request.claim', entityType: 'OnlineAppointmentRequest', entityId: requestId,
        metadata: { previousAssignee: request.assignedEmployeeId },
      } });
      return updated;
    });
  }

  async takeover(requestId: string, directorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockOnlineRequest(tx, requestId);
      const request = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: requestId } });
      assertNotDeleted(request.deletedAt);
      assertRequestActive(request.status);
      if (!request.assignedEmployeeId) throw new ConflictException('Заявка свободна — возьмите её в работу');
      if (request.assignedEmployeeId === directorId) return request;
      const updated = await tx.onlineAppointmentRequest.update({
        where: { id: requestId },
        data: { status: 'IN_REVIEW', assignedEmployeeId: directorId, claimedAt: new Date(), conversationNeedsAttention: false },
        include: { assignedEmployee: { select: { id: true, fullName: true, status: true } } },
      });
      await tx.onlineRequestSnooze.deleteMany({ where: { requestId } });
      await tx.auditLog.create({ data: {
        actorId: directorId, action: 'online_request.takeover', entityType: 'OnlineAppointmentRequest', entityId: requestId,
        metadata: { previousAssignee: request.assignedEmployeeId },
      } });
      return updated;
    });
  }

  async snooze(requestId: string, employeeId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockOnlineRequest(tx, requestId);
      const request = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: requestId } });
      assertNotDeleted(request.deletedAt);
      if (!request.conversationNeedsAttention) assertRequestActive(request.status);
      const until = new Date(Date.now() + 2 * 60_000);
      await tx.onlineRequestSnooze.upsert({
        where: { requestId_employeeId: { requestId, employeeId } },
        create: { requestId, employeeId, until }, update: { until },
      });
      await tx.auditLog.create({ data: {
        actorId: employeeId, action: 'online_request.snooze', entityType: 'OnlineAppointmentRequest', entityId: requestId,
        metadata: { until: until.toISOString() },
      } });
      return { requestId, until };
    });
  }

  async release(requestId: string, employeeId: string) {
    return this.prisma.$transaction(async tx => {
      await lockOnlineRequest(tx, requestId);
      const current = await tx.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: requestId } });
      assertNotDeleted(current.deletedAt);
      if (!current.conversationNeedsAttention) assertRequestActive(current.status);
      if (current.assignedEmployeeId !== employeeId) throw new ConflictException('Вернуть в очередь может ответственный сотрудник');
      const updated = await tx.onlineAppointmentRequest.update({ where: { id: requestId }, data: {
        status: 'NEW' as const, assignedEmployeeId: null, claimedAt: null,
      } });
      await tx.onlineRequestSnooze.deleteMany({ where: { requestId } });
      await tx.auditLog.create({ data: { actorId: employeeId, action: 'online_request.release', entityType: 'OnlineAppointmentRequest', entityId: requestId } });
      return updated;
    });
  }
}

export async function lockOnlineRequest(tx: Prisma.TransactionClient, requestId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "OnlineAppointmentRequest" WHERE "id" = ${requestId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundException('Онлайн-заявка не найдена');
}

function assertRequestActive(status: string) {
  if (!activeStatuses.includes(status as typeof activeStatuses[number])) {
    throw new ConflictException('Эта заявка уже обработана');
  }
}

function assertNotDeleted(deletedAt: Date | null) {
  if (deletedAt) throw new NotFoundException('Онлайн-заявка удалена');
}
