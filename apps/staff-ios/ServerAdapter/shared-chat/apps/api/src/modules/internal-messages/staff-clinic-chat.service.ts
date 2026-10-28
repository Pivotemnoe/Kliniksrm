import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClinicChatQueryDto, ClinicChatSendDto } from './dto/clinic-chat.dto';

const senderSelect = { id: true, fullName: true, position: true, status: true } as const;
@Injectable()
export class StaffClinicChatService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  private async syncSingleTenant(channel: { id: string; organizationId: string }, tx: any) {
    const organizations = await tx.organization.findMany({ select: { id: true }, take: 2 });
    // Employee has no tenant FK in this CRM. Only a verified single-organization installation
    // can infer membership; multi-organization deployments must bind employees explicitly.
    if (organizations.length !== 1 || organizations[0].id !== channel.organizationId) return;
    const employees = await tx.employee.findMany({ where: { status: 'ACTIVE', userId: { not: null }, accountScope: { in: ['CLINIC', 'GROOMING'] } }, select: { id: true } });
    await tx.staffClinicChatMembership.createMany({ data: employees.map((employee: { id: string }) => ({ channelId: channel.id, employeeId: employee.id })), skipDuplicates: true });
  }
  private async context(actorId: string, tx: any = this.prisma): Promise<{ channel: any; member: any }> {
    let member = await tx.staffClinicChatMembership.findUnique({ where: { employeeId: actorId }, include: { channel: true } });
    if (member) {
      await this.syncSingleTenant(member.channel, tx);
      return { channel: member.channel, member };
    }
    const organizations = await tx.organization.findMany({ select: { id: true }, take: 2 });
    if (organizations.length !== 1) throw new ServiceUnavailableException('Нужно привязать сотрудника к общему чату его клиники');
    const channel = await tx.staffClinicChannel.upsert({ where: { organizationId: organizations[0].id },
      create: { organizationId: organizations[0].id }, update: {} });
    await this.syncSingleTenant(channel, tx);
    member = await tx.staffClinicChatMembership.findUnique({ where: { employeeId: actorId }, include: { channel: true } });
    if (!member || member.channelId !== channel.id) throw new ForbiddenException('Нет доступа к общему чату этой клиники');
    return { channel, member };
  }
  async summary(actorId: string) {
    const { channel, member } = await this.context(actorId);
    const [last, unreadCount] = await Promise.all([
      this.prisma.staffClinicChatMessage.findFirst({ where: { channelId: channel.id }, orderBy: { sequence: 'desc' }, include: { sender: { select: senderSelect } } }),
      this.prisma.staffClinicChatMessage.count({ where: { channelId: channel.id, senderId: { not: actorId }, sequence: { gt: member.readThroughSequence } } }),
    ]);
    return { id: channel.id, title: channel.title, unreadCount, lastMessage: last ? serialize(last) : null };
  }
  async thread(query: ClinicChatQueryDto, actorId: string) {
    const { channel, member } = await this.context(actorId), limit = Math.max(1, Math.min(200, Math.trunc(Number(query.limit)) || 100));
    const rows = await this.prisma.staffClinicChatMessage.findMany({ where: { channelId: channel.id,
      ...(query.beforeSequence ? { sequence: { lt: BigInt(query.beforeSequence) } } : {}) },
      orderBy: { sequence: 'desc' }, take: limit + 1, include: { sender: { select: senderSelect } } });
    const hasMore = rows.length > limit, page = rows.slice(0, limit).reverse();
    return { channelId: channel.id, title: channel.title, items: page.map(serialize), readThroughSequence: String(member.readThroughSequence),
      hasMore, nextBeforeSequence: hasMore ? String(page[0].sequence) : null, limit };
  }
  async send(dto: ClinicChatSendDto, actorId: string) {
    const body = dto.body.trim();
    if (!body || body.length > 4000) throw new BadRequestException('Введите сообщение до 4000 символов');
    return this.prisma.$transaction(async tx => {
      const { channel } = await this.context(actorId, tx);
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(20261028,hashtext($1))', channel.id + ':' + actorId + ':' + dto.clientKey);
      const key = { channelId_senderId_clientKey: { channelId: channel.id, senderId: actorId, clientKey: dto.clientKey } };
      const previous = await tx.staffClinicChatMessage.findUnique({ where: key, include: { sender: { select: senderSelect } } });
      if (previous) {
        if (previous.body !== body) throw new ConflictException('Ключ отправки уже использован с другим сообщением');
        return serialize(previous);
      }
      const advanced = await tx.staffClinicChannel.update({ where: { id: channel.id }, data: { nextSequence: { increment: 1 } } });
      const message = await tx.staffClinicChatMessage.create({ data: { channelId: channel.id, senderId: actorId, body,
        clientKey: dto.clientKey, sequence: advanced.nextSequence }, include: { sender: { select: senderSelect } } });
      const members = await tx.staffClinicChatMembership.findMany({ where: { channelId: channel.id, employeeId: { not: actorId },
        employee: { status: 'ACTIVE', userId: { not: null } } }, select: { employeeId: true } });
      await tx.staffNativePushEvent.createMany({ data: members.map(member => ({
        employeeId: member.employeeId, kind: 'CLINIC_CHAT', sourceId: message.id, channelId: channel.id,
        dedupeKey: 'clinic-chat:' + message.id + ':' + member.employeeId, expiresAt: new Date(Date.now() + 86400000),
      })), skipDuplicates: true });
      await this.audit.log({ actorId, action: 'staff_clinic_chat.send', entityType: 'StaffClinicChatMessage', entityId: message.id,
        metadata: { channelId: channel.id, length: body.length } }, tx);
      return serialize(message);
    });
  }
  async read(throughId: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const { channel, member } = await this.context(actorId, tx);
      const message = await tx.staffClinicChatMessage.findFirst({ where: { id: throughId, channelId: channel.id }, select: { sequence: true } });
      if (!message) throw new NotFoundException('Сообщение не найдено в общем чате этой клиники');
      await tx.staffClinicChatMembership.updateMany({ where: { id: member.id, readThroughSequence: { lt: message.sequence } },
        data: { readThroughSequence: message.sequence } });
      const read = await tx.staffClinicChatMessage.findMany({ where: { channelId: channel.id, sequence: { lte: message.sequence } }, select: { id: true } });
      await tx.staffNativePushDelivery.updateMany({ where: { state: 'QUEUED', event: { employeeId: actorId, kind: 'CLINIC_CHAT',
        channelId: channel.id, sourceId: { in: read.map(row => row.id) } } }, data: { state: 'CANCELLED' } });
      const current = await tx.staffClinicChatMembership.findUniqueOrThrow({ where: { id: member.id } });
      return { ok: true, readThroughSequence: String(current.readThroughSequence) };
    });
  }
}
function serialize(message: any) {
  return { id: message.id, channelId: message.channelId, body: message.body, clientKey: message.clientKey,
    sequence: String(message.sequence), createdAt: message.createdAt, sender: message.sender };
}
