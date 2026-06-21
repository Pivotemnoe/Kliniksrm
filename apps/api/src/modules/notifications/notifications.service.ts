import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientPortalStatus, NotificationStatus, Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { UpdatePortalAccessDto } from './dto/update-portal-access.dto';
import { UpsertTemplateDto } from './dto/upsert-template.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listOutbox(query: ListNotificationsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const where: Prisma.NotificationOutboxWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...(query.scheduledFrom || query.scheduledTo
        ? {
            scheduledAt: {
              ...(query.scheduledFrom ? { gte: new Date(query.scheduledFrom) } : {}),
              ...(query.scheduledTo ? { lte: new Date(query.scheduledTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationOutbox.findMany({
        where,
        orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'desc' }],
        include: notificationInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.notificationOutbox.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async createOutbox(dto: CreateNotificationDto, actorId: string) {
    const ownerId = emptyToNull(dto.ownerId);
    const animalId = emptyToNull(dto.animalId);
    const templateId = emptyToNull(dto.templateId);

    if (ownerId) {
      await this.ensureOwnerExists(ownerId);
    }

    if (animalId) {
      await this.ensureAnimalExists(animalId, ownerId ?? undefined);
    }

    if (templateId) {
      await this.ensureTemplateExists(templateId);
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Укажите корректную дату отправки');
    }

    const message = await this.prisma.notificationOutbox.create({
      data: {
        ownerId,
        animalId,
        templateId,
        createdById: actorId,
        channel: dto.channel,
        recipient: dto.recipient.trim(),
        subject: emptyToNull(dto.subject),
        body: dto.body.trim(),
        scheduledAt,
      },
      include: notificationInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'notification.queue',
      entityType: 'NotificationOutbox',
      entityId: message.id,
      metadata: {
        channel: message.channel,
        ownerId: message.ownerId,
        animalId: message.animalId,
        status: message.status,
      },
    });

    return message;
  }

  async retryOutbox(notificationId: string, actorId: string) {
    await this.ensureOutboxExists(notificationId);
    const message = await this.prisma.notificationOutbox.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.QUEUED,
        lastError: null,
        scheduledAt: new Date(),
      },
      include: notificationInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'notification.retry',
      entityType: 'NotificationOutbox',
      entityId: message.id,
      metadata: { status: message.status },
    });

    return message;
  }

  async cancelOutbox(notificationId: string, actorId: string) {
    await this.ensureOutboxExists(notificationId);
    const message = await this.prisma.notificationOutbox.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.CANCELLED },
      include: notificationInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'notification.cancel',
      entityType: 'NotificationOutbox',
      entityId: message.id,
      metadata: { status: message.status },
    });

    return message;
  }

  listTemplates(query: ListTemplatesQueryDto) {
    return this.prisma.notificationTemplate.findMany({
      where: {
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive === 'true' } : {}),
      },
      orderBy: [{ channel: 'asc' }, { eventCode: 'asc' }],
    });
  }

  async upsertTemplate(dto: UpsertTemplateDto, actorId: string) {
    const template = await this.prisma.notificationTemplate.upsert({
      where: {
        channel_eventCode: {
          channel: dto.channel.trim(),
          eventCode: dto.eventCode.trim(),
        },
      },
      create: {
        channel: dto.channel.trim(),
        eventCode: dto.eventCode.trim(),
        title: dto.title.trim(),
        subject: emptyToNull(dto.subject),
        body: dto.body.trim(),
        isActive: dto.isActive ?? true,
      },
      update: {
        title: dto.title.trim(),
        subject: emptyToNull(dto.subject),
        body: dto.body.trim(),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.auditService.log({
      actorId,
      action: 'notification_template.upsert',
      entityType: 'NotificationTemplate',
      entityId: template.id,
      metadata: { channel: template.channel, eventCode: template.eventCode },
    });

    return template;
  }

  async getPortalAccess(ownerId: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true, fullName: true, phone: true, email: true },
    });

    if (!owner) {
      throw new NotFoundException('Владелец не найден');
    }

    const access = await this.prisma.clientPortalAccess.findUnique({
      where: { ownerId },
    });

    return access ?? { id: null, ownerId, owner, status: ClientPortalStatus.DISABLED };
  }

  async updatePortalAccess(ownerId: string, dto: UpdatePortalAccessDto, actorId: string) {
    await this.ensureOwnerExists(ownerId);
    const inviteToken = dto.status === ClientPortalStatus.INVITED ? randomBytes(24).toString('hex') : null;
    const access = await this.prisma.clientPortalAccess.upsert({
      where: { ownerId },
      create: {
        ownerId,
        status: dto.status,
        blockedReason: dto.status === ClientPortalStatus.BLOCKED ? emptyToNull(dto.blockedReason) : null,
        inviteTokenHash: inviteToken ? hashToken(inviteToken) : null,
        inviteExpiresAt: inviteToken ? addDays(new Date(), 7) : null,
        invitedAt: inviteToken ? new Date() : null,
      },
      update: {
        status: dto.status,
        blockedReason: dto.status === ClientPortalStatus.BLOCKED ? emptyToNull(dto.blockedReason) : null,
        inviteTokenHash: inviteToken ? hashToken(inviteToken) : undefined,
        inviteExpiresAt: inviteToken ? addDays(new Date(), 7) : undefined,
        invitedAt: inviteToken ? new Date() : undefined,
      },
      include: {
        owner: { select: { id: true, fullName: true, phone: true, email: true } },
      },
    });

    await this.auditService.log({
      actorId,
      action: 'client_portal.access_update',
      entityType: 'ClientPortalAccess',
      entityId: access.id,
      metadata: { ownerId, status: access.status },
    });

    return {
      ...access,
      inviteToken,
    };
  }

  private async ensureOwnerExists(ownerId: string) {
    const owner = await this.prisma.owner.findUnique({ where: { id: ownerId }, select: { id: true } });

    if (!owner) {
      throw new NotFoundException('Владелец не найден');
    }
  }

  private async ensureAnimalExists(animalId: string, ownerId?: string) {
    const animal = await this.prisma.animal.findUnique({ where: { id: animalId }, select: { id: true, ownerId: true } });

    if (!animal) {
      throw new NotFoundException('Пациент не найден');
    }

    if (ownerId && animal.ownerId !== ownerId) {
      throw new BadRequestException('Пациент не принадлежит выбранному владельцу');
    }
  }

  private async ensureTemplateExists(templateId: string) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id: templateId }, select: { id: true } });

    if (!template) {
      throw new NotFoundException('Шаблон уведомления не найден');
    }
  }

  private async ensureOutboxExists(notificationId: string) {
    const message = await this.prisma.notificationOutbox.findUnique({ where: { id: notificationId }, select: { id: true } });

    if (!message) {
      throw new NotFoundException('Уведомление не найдено');
    }
  }
}

const notificationInclude = {
  owner: { select: { id: true, fullName: true, phone: true, email: true } },
  animal: { select: { id: true, nickname: true, species: true, breed: true } },
  template: { select: { id: true, channel: true, eventCode: true, title: true } },
  createdBy: { select: { id: true, fullName: true, position: true } },
} satisfies Prisma.NotificationOutboxInclude;

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
