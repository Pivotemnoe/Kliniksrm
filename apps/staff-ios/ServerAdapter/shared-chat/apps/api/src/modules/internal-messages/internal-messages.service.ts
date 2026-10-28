import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInternalMessageDto } from './dto/create-internal-message.dto';
import { ListInternalMessagesQueryDto } from './dto/list-internal-messages-query.dto';

@Injectable()
export class InternalMessagesService {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  listRecipients(actorId: string) {
    return this.prisma.employee.findMany({
      where: { id: { not: actorId }, status: EmployeeStatus.ACTIVE, accountScope: { in: ['CLINIC', 'GROOMING'] } },
      orderBy: { fullName: 'asc' }, select: staffEmployeeSelect,
    });
  }

  async listConversations(actorId: string) {
    // One latest row per peer across the entire shared history, including quiet old dialogs.
    const latest = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT DISTINCT ON ("otherId") "id" FROM (SELECT "id","createdAt",CASE WHEN "senderId"=$1 THEN "recipientId" ELSE "senderId" END AS "otherId" FROM "InternalMessage" WHERE "senderId"=$1 OR "recipientId"=$1) t ORDER BY "otherId","createdAt" DESC,"id" DESC', actorId);
    const [messages, unreadGroups, totalUnread] = await Promise.all([
      this.prisma.internalMessage.findMany({ where: { id: { in: latest.map(row => row.id) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: internalMessageInclude }),
      this.prisma.internalMessage.groupBy({ by: ['senderId'], where: { recipientId: actorId, readAt: null }, _count: { _all: true } }),
      this.prisma.internalMessage.count({ where: { recipientId: actorId, readAt: null } }),
    ]);
    const unreadBySender = new Map(unreadGroups.map(group => [group.senderId, group._count._all]));
    return { items: messages.map(message => {
      const other = message.senderId === actorId ? message.recipient : message.sender;
      return { employee: other, lastMessage: serializeMessage(message), unreadCount: unreadBySender.get(other.id) ?? 0 };
    }), totalUnread };
  }

  async listThread(query: ListInternalMessagesQueryDto, actorId: string) {
    await this.ensureEmployeeExists(query.employeeId);
    const limit = clampLimit(query.limit), pair = conversationPair(actorId, query.employeeId);
    let boundary: Prisma.InternalMessageWhereInput = {};
    if (query.beforeId) {
      const before = await this.prisma.internalMessage.findFirst({ where: { id: query.beforeId, ...pair }, select: { id: true, createdAt: true } });
      if (!before) throw new NotFoundException('Граница истории не найдена в этом диалоге');
      boundary = { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] };
    }
    const messages = await this.prisma.internalMessage.findMany({
      where: { AND: [pair, boundary] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, include: internalMessageInclude,
    });
    const hasMore = messages.length > limit, page = messages.slice(0, limit);
    return { items: page.reverse().map(serializeMessage), limit, hasMore, nextBeforeId: hasMore ? page[0]?.id : null };
  }

  async send(dto: CreateInternalMessageDto, actorId: string) {
    if (dto.recipientId === actorId) throw new BadRequestException('Выберите другого сотрудника');
    const body = dto.body.trim();
    if (!body || body.length > 4000) throw new BadRequestException('Введите сообщение до 4000 символов');
    return this.prisma.$transaction(async tx => {
      if (dto.clientKey) {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(20261028,hashtext($1))', actorId + ':' + dto.clientKey);
        const previous = await tx.internalMessage.findUnique({ where: { senderId_clientKey: { senderId: actorId, clientKey: dto.clientKey } }, include: internalMessageInclude });
        if (previous) {
          if (previous.recipientId !== dto.recipientId || previous.body !== body) throw new ConflictException('Ключ отправки уже использован с другим сообщением');
          return serializeMessage(previous);
        }
      }
      const recipient = await tx.employee.findFirst({ where: { id: dto.recipientId, status: EmployeeStatus.ACTIVE }, select: { id: true } });
      if (!recipient) throw new NotFoundException('Активный сотрудник не найден');
      const message = await tx.internalMessage.create({
        data: { senderId: actorId, recipientId: dto.recipientId, body, clientKey: dto.clientKey }, include: internalMessageInclude,
      });
      // Transactional outbox: every sender, every platform and the ordinary CRM use one path.
      await tx.staffNativePushEvent.create({ data: {
        employeeId: dto.recipientId, kind: 'INTERNAL_MESSAGE', sourceId: message.id,
        conversationEmployeeId: actorId, dedupeKey: 'internal-message:' + message.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } });
      await this.auditService.log({ actorId, action: 'internal_message.send', entityType: 'InternalMessage', entityId: message.id,
        metadata: { recipientId: dto.recipientId, length: body.length } }, tx);
      return serializeMessage(message);
    });
  }

  async markConversationRead(employeeId: string, actorId: string, throughId?: string) {
    await this.ensureEmployeeExists(employeeId);
    return this.prisma.$transaction(async tx => {
      let boundary: Prisma.InternalMessageWhereInput = {};
      if (throughId) {
        const through = await tx.internalMessage.findFirst({
          where: { id: throughId, senderId: employeeId, recipientId: actorId }, select: { id: true, createdAt: true } });
        if (!through) throw new NotFoundException('Сообщение не найдено в этом входящем диалоге');
        boundary = { OR: [{ createdAt: { lt: through.createdAt } }, { createdAt: through.createdAt, id: { lte: through.id } }] };
      }
      const where = { senderId: employeeId, recipientId: actorId, readAt: null, ...boundary };
      const incoming = await tx.internalMessage.findMany({ where, select: { id: true } });
      const result = await tx.internalMessage.updateMany({ where, data: { readAt: new Date() } });
      if (incoming.length) await tx.staffNativePushDelivery.updateMany({ where: {
        state: 'QUEUED', event: { employeeId: actorId, kind: 'INTERNAL_MESSAGE', sourceId: { in: incoming.map(row => row.id) } },
      }, data: { state: 'CANCELLED' } });
      if (result.count) await this.auditService.log({ actorId, action: 'internal_message.read', entityType: 'InternalMessageConversation',
        entityId: employeeId, metadata: { count: result.count } }, tx);
      return { ok: true, count: result.count };
    });
  }

  private async ensureEmployeeExists(employeeId: string) {
    if (!await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } })) throw new NotFoundException('Сотрудник не найден');
  }
}

const staffEmployeeSelect = {
  id: true, fullName: true, position: true, status: true,
  // Existing CRM renders role titles. No role permissions, phone, email or patient data.
  roles: { select: { role: { select: { code: true, title: true } } } },
} satisfies Prisma.EmployeeSelect;
const internalMessageInclude = { sender: { select: staffEmployeeSelect }, recipient: { select: staffEmployeeSelect } } satisfies Prisma.InternalMessageInclude;
type InternalMessageWithEmployees = Prisma.InternalMessageGetPayload<{ include: typeof internalMessageInclude }>;
function serializeMessage(message: InternalMessageWithEmployees) {
  return { id: message.id, body: message.body, clientKey: message.clientKey, readAt: message.readAt, createdAt: message.createdAt,
    sender: message.sender, recipient: message.recipient };
}
function conversationPair(actorId: string, peerId: string): Prisma.InternalMessageWhereInput {
  return { OR: [{ senderId: actorId, recipientId: peerId }, { senderId: peerId, recipientId: actorId }] };
}
function clampLimit(value?: string) {
  const parsed = Number(value ?? 100);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 200) : 100;
}
