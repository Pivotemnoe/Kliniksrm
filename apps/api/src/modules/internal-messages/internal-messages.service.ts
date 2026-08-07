import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInternalMessageDto } from './dto/create-internal-message.dto';
import { ListInternalMessagesQueryDto } from './dto/list-internal-messages-query.dto';

@Injectable()
export class InternalMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listRecipients(actorId: string) {
    return this.prisma.employee.findMany({
      where: { id: { not: actorId }, status: EmployeeStatus.ACTIVE },
      orderBy: { fullName: 'asc' },
      select: staffEmployeeSelect,
    });
  }

  async listConversations(actorId: string) {
    const [recentMessages, unreadGroups, totalUnread] = await Promise.all([
      this.prisma.internalMessage.findMany({
        where: { OR: [{ senderId: actorId }, { recipientId: actorId }] },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        include: internalMessageInclude,
      }),
      this.prisma.internalMessage.groupBy({
        by: ['senderId'],
        where: { recipientId: actorId, readAt: null },
        _count: { _all: true },
      }),
      this.prisma.internalMessage.count({ where: { recipientId: actorId, readAt: null } }),
    ]);
    const unreadBySender = new Map(unreadGroups.map((group) => [group.senderId, group._count._all]));
    const conversations = new Map<string, {
      employee: StaffEmployee;
      lastMessage: ReturnType<typeof serializeMessage>;
      unreadCount: number;
    }>();

    for (const message of recentMessages) {
      const other = message.senderId === actorId ? message.recipient : message.sender;
      if (conversations.has(other.id)) continue;
      conversations.set(other.id, {
        employee: other,
        lastMessage: serializeMessage(message),
        unreadCount: unreadBySender.get(other.id) ?? 0,
      });
    }

    return { items: [...conversations.values()], totalUnread };
  }

  async listThread(query: ListInternalMessagesQueryDto, actorId: string) {
    await this.ensureEmployeeExists(query.employeeId);
    const limit = clampLimit(query.limit);
    const messages = await this.prisma.internalMessage.findMany({
      where: {
        OR: [
          { senderId: actorId, recipientId: query.employeeId },
          { senderId: query.employeeId, recipientId: actorId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: internalMessageInclude,
    });

    return { items: messages.reverse().map(serializeMessage), limit };
  }

  async send(dto: CreateInternalMessageDto, actorId: string) {
    if (dto.recipientId === actorId) {
      throw new BadRequestException('Выберите другого сотрудника');
    }
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('Введите сообщение');
    }

    const recipient = await this.prisma.employee.findFirst({
      where: { id: dto.recipientId, status: EmployeeStatus.ACTIVE },
      select: { id: true },
    });
    if (!recipient) {
      throw new NotFoundException('Активный сотрудник не найден');
    }

    const message = await this.prisma.internalMessage.create({
      data: { senderId: actorId, recipientId: dto.recipientId, body },
      include: internalMessageInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'internal_message.send',
      entityType: 'InternalMessage',
      entityId: message.id,
      metadata: { recipientId: dto.recipientId, length: body.length },
    });

    return serializeMessage(message);
  }

  async markConversationRead(employeeId: string, actorId: string) {
    await this.ensureEmployeeExists(employeeId);
    const result = await this.prisma.internalMessage.updateMany({
      where: { senderId: employeeId, recipientId: actorId, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count) {
      await this.auditService.log({
        actorId,
        action: 'internal_message.read',
        entityType: 'InternalMessageConversation',
        entityId: employeeId,
        metadata: { count: result.count },
      });
    }

    return { ok: true, count: result.count };
  }

  private async ensureEmployeeExists(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) {
      throw new NotFoundException('Сотрудник не найден');
    }
  }
}

const staffEmployeeSelect = {
  id: true,
  fullName: true,
  position: true,
  status: true,
  roles: { select: { role: { select: { code: true, title: true } } } },
} satisfies Prisma.EmployeeSelect;

const internalMessageInclude = {
  sender: { select: staffEmployeeSelect },
  recipient: { select: staffEmployeeSelect },
} satisfies Prisma.InternalMessageInclude;

type StaffEmployee = Prisma.EmployeeGetPayload<{ select: typeof staffEmployeeSelect }>;
type InternalMessageWithEmployees = Prisma.InternalMessageGetPayload<{ include: typeof internalMessageInclude }>;

function serializeMessage(message: InternalMessageWithEmployees) {
  return {
    id: message.id,
    body: message.body,
    readAt: message.readAt,
    createdAt: message.createdAt,
    sender: message.sender,
    recipient: message.recipient,
  };
}

function clampLimit(value?: string) {
  const parsed = Number(value ?? 100);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 200) : 100;
}
