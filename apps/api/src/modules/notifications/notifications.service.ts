import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ClientPortalStatus, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { MaxBotClient, MaxPortalInviteDelivery } from './providers/max-bot.client';
import { OwnerGatewayClient, OwnerMessengerChannel } from './providers/owner-gateway.client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { CreatePortalInviteDto, PortalInviteChannel } from './dto/create-portal-invite.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { UpdatePortalAccessDto } from './dto/update-portal-access.dto';
import { UpsertTemplateDto } from './dto/upsert-template.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly maxBotClient: MaxBotClient,
    private readonly ownerGatewayClient: OwnerGatewayClient,
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
    const directRecipient = emptyToNull(dto.recipient);

    if (dto.channel === NotificationChannel.MESSENGER && !ownerId) {
      throw new BadRequestException('Для автоматической отправки выберите владельца');
    }

    if (dto.channel !== NotificationChannel.MESSENGER && !directRecipient) {
      throw new BadRequestException('Укажите получателя');
    }

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

    const templateContext = await this.buildTemplateContext(ownerId, animalId, scheduledAt);

    const message = await this.prisma.notificationOutbox.create({
      data: {
        ownerId,
        animalId,
        templateId,
        createdById: actorId,
        channel: dto.channel,
        recipient: directRecipient ?? `owner:${ownerId}`,
        subject: renderNotificationTemplate(emptyToNull(dto.subject), templateContext),
        body: renderNotificationTemplate(dto.body.trim(), templateContext) ?? '',
        scheduledAt,
        ...(dto.channel === NotificationChannel.MESSENGER && dto.messengerChannels !== undefined
          ? {
              metadata: {
                delivery: {
                  mode: 'EXPLICIT',
                  messengerChannels: dto.messengerChannels,
                  deliveredMessengerChannels: [],
                },
              },
            }
          : {}),
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
    const gatewayStatus = await this.ownerGatewayClient.getStatus(ownerId);

    return access
      ? { ...access, gatewayStatus }
      : { id: null, ownerId, owner, status: ClientPortalStatus.DISABLED, gatewayStatus };
  }

  async updatePortalAccess(ownerId: string, dto: UpdatePortalAccessDto, actorId: string) {
    await this.ensureOwnerExists(ownerId);
    const inviteToken = dto.status === ClientPortalStatus.INVITED ? randomBytes(24).toString('hex') : null;
    const invalidatesTokens = dto.status === ClientPortalStatus.DISABLED || dto.status === ClientPortalStatus.BLOCKED;
    const access = await this.prisma.clientPortalAccess.upsert({
      where: { ownerId },
      create: {
        ownerId,
        status: dto.status,
        blockedReason: dto.status === ClientPortalStatus.BLOCKED ? emptyToNull(dto.blockedReason) : null,
        inviteTokenHash: inviteToken ? hashToken(inviteToken) : null,
        inviteExpiresAt: inviteToken ? addHours(new Date(), 24) : null,
        invitedAt: inviteToken ? new Date() : null,
      },
      update: {
        status: dto.status,
        blockedReason: dto.status === ClientPortalStatus.BLOCKED ? emptyToNull(dto.blockedReason) : null,
        inviteTokenHash: inviteToken ? hashToken(inviteToken) : invalidatesTokens ? null : undefined,
        inviteExpiresAt: inviteToken ? addHours(new Date(), 24) : invalidatesTokens ? null : undefined,
        invitedAt: inviteToken ? new Date() : undefined,
        loginCodeHash: invalidatesTokens ? null : undefined,
        loginCodeExpiresAt: invalidatesTokens ? null : undefined,
        loginCodeAttempts: invalidatesTokens ? 0 : undefined,
      },
      include: {
        owner: { select: { id: true, fullName: true, phone: true, email: true } },
      },
    });
    const gatewaySync = invalidatesTokens ? await this.ownerGatewayClient.revokeAccess(ownerId) : undefined;

    await this.auditService.log({
      actorId,
      action: 'client_portal.access_update',
      entityType: 'ClientPortalAccess',
      entityId: access.id,
      metadata: { ownerId, status: access.status, gatewaySync },
    });

    return { ...access, inviteToken, gatewaySync };
  }

  async createPortalInvite(ownerId: string, dto: CreatePortalInviteDto, actorId: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        telegramChatId: true,
        maxUserId: true,
      },
    });

    if (!owner) {
      throw new NotFoundException('Владелец не найден');
    }

    const inviteToken = randomBytes(24).toString('hex');
    const now = new Date();
    const inviteExpiresAt = addHours(now, 24);
    const notificationChannel = toNotificationChannel(dto.channel);
    const directRecipient = getDirectInviteRecipient(owner, dto.channel);

    const access = await this.prisma.$transaction(async (tx) => {
      if (notificationChannel) {
        await tx.owner.update({
          where: { id: ownerId },
          data: {
            preferredNotificationChannel: notificationChannel,
            ...(notificationChannel === NotificationChannel.MAX ? { allowMax: true } : { allowTelegram: true }),
          },
        });
      }

      return tx.clientPortalAccess.upsert({
        where: { ownerId },
        create: {
          ownerId,
          status: ClientPortalStatus.INVITED,
          inviteTokenHash: hashToken(inviteToken),
          inviteExpiresAt,
          invitedAt: now,
        },
        update: {
          status: ClientPortalStatus.INVITED,
          blockedReason: null,
          inviteTokenHash: hashToken(inviteToken),
          inviteExpiresAt,
          invitedAt: now,
          loginCodeHash: null,
          loginCodeExpiresAt: null,
          loginCodeAttempts: 0,
        },
        include: {
          owner: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      });
    });

    const gatewayResult = await this.ownerGatewayClient.syncInvitation({
      ownerId,
      displayName: owner.fullName,
      token: inviteToken,
      channel: dto.channel,
      expiresAt: inviteExpiresAt,
    });
    const automaticDelivery = gatewayResult.status === 'synced'
      ? gatewayResult.automaticDelivery
      : await this.deliverPortalInvite(dto.channel, ownerId, directRecipient, inviteToken);

    await this.auditService.log({
      actorId,
      action: 'client_portal.invite_create',
      entityType: 'ClientPortalAccess',
      entityId: access.id,
      metadata: {
        ownerId,
        channel: dto.channel,
        directDeliveryAvailable: Boolean(directRecipient),
        automaticDelivery,
        gatewaySync: gatewayResult.status,
        gatewayFailureReason: gatewayResult.failureReason,
      },
    });

    return {
      ...access,
      inviteToken,
      inviteChannel: dto.channel,
      directDeliveryAvailable: Boolean(directRecipient),
      deliveryUrl: gatewayResult.deliveryUrl,
      automaticDelivery,
      gatewaySync: gatewayResult.status,
    };
  }

  async syncPortalSnapshot(ownerId: string, actorId: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true, fullName: true },
    });

    if (!owner) {
      throw new NotFoundException('Владелец не найден');
    }

    const status = await this.ownerGatewayClient.syncSnapshot({ ownerId, displayName: owner.fullName });
    await this.auditService.log({
      actorId,
      action: 'client_portal.snapshot_sync',
      entityType: 'Owner',
      entityId: ownerId,
      metadata: { status },
    });

    return { ok: status === 'synced', status };
  }

  async resetPortalConnection(ownerId: string, channelValue: string, actorId: string) {
    const channel = normalizeOwnerMessengerChannel(channelValue);
    await this.ensureOwnerExists(ownerId);

    const gatewaySync = await this.ownerGatewayClient.resetConnection(ownerId, channel);
    if (gatewaySync !== 'synced') {
      throw new ServiceUnavailableException(
        'Публичный шлюз не подтвердил сброс. Привязка и текущие входы сохранены, повторите позже.',
      );
    }

    const access = await this.prisma.$transaction(async (tx) => {
      await tx.owner.update({
        where: { id: ownerId },
        data: channel === 'MAX' ? { maxUserId: null } : { telegramChatId: null },
      });

      return tx.clientPortalAccess.upsert({
        where: { ownerId },
        create: { ownerId, status: ClientPortalStatus.DISABLED },
        update: {
          status: ClientPortalStatus.DISABLED,
          inviteTokenHash: null,
          inviteExpiresAt: null,
          invitedAt: null,
          lastLoginAt: null,
          loginCodeHash: null,
          loginCodeExpiresAt: null,
          loginCodeAttempts: 0,
          blockedReason: null,
        },
        include: {
          owner: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      });
    });

    await this.auditService.log({
      actorId,
      action: 'client_portal.connection_reset',
      entityType: 'ClientPortalAccess',
      entityId: access.id,
      metadata: { ownerId, channel, gatewaySync },
    });

    return { ...access, channel, gatewaySync };
  }

  private async deliverPortalInvite(
    channel: PortalInviteChannel,
    ownerId: string,
    recipient: string | null,
    inviteToken: string,
  ): Promise<MaxPortalInviteDelivery | 'manual_required' | 'not_implemented'> {
    if (!recipient) {
      return 'manual_required';
    }

    if (channel === PortalInviteChannel.MAX) {
      return this.maxBotClient.sendPortalInvite(ownerId, recipient, inviteToken);
    }

    if (channel === PortalInviteChannel.TELEGRAM) {
      return 'not_implemented';
    }

    return 'manual_required';
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

  private async buildTemplateContext(ownerId: string | null, animalId: string | null, scheduledAt: Date) {
    const [owner, animal, organization] = await Promise.all([
      ownerId
        ? this.prisma.owner.findUnique({
            where: { id: ownerId },
            include: { office: { include: { organization: true } } },
          })
        : Promise.resolve(null),
      animalId
        ? this.prisma.animal.findUnique({
            where: { id: animalId },
            include: { owner: { include: { office: { include: { organization: true } } } } },
          })
        : Promise.resolve(null),
      this.prisma.organization.findFirst({
        include: { offices: { orderBy: { createdAt: 'asc' }, take: 1 } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const templateOwner = owner ?? animal?.owner ?? null;
    const templateOffice = templateOwner?.office ?? organization?.offices[0] ?? null;
    const templateOrganization = templateOwner?.office?.organization ?? organization;

    return {
      owner: templateOwner,
      animal,
      office: templateOffice,
      organization: templateOrganization,
      scheduledAt,
    };
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

type NotificationTemplateContext = {
  owner: {
    fullName: string;
    phone: string | null;
    extraPhone: string | null;
    email: string | null;
    address: string | null;
  } | null;
  animal: {
    nickname: string;
    species: string | null;
    breed: string | null;
  } | null;
  office: {
    name: string;
    phone: string | null;
    address: string | null;
  } | null;
  organization: {
    displayName: string;
    legalName: string | null;
    orgType: string | null;
    legalAddress: string | null;
  } | null;
  scheduledAt: Date;
};

function renderNotificationTemplate(text: string | null | undefined, context: NotificationTemplateContext) {
  if (!text) {
    return null;
  }

  const values: Record<string, string | null | undefined> = {
    'organization.displayName': context.organization?.displayName,
    'organization.legalName': context.organization?.legalName,
    'organization.orgType': context.organization?.orgType,
    'clinic.name': context.organization?.displayName,
    'clinic.legalName': context.organization?.legalName,
    'clinic.address': context.office?.address ?? context.organization?.legalAddress,
    'office.name': context.office?.name,
    'office.phone': context.office?.phone,
    'office.address': context.office?.address,
    'owner.fullName': context.owner?.fullName,
    'owner.phone': context.owner?.phone,
    'owner.extraPhone': context.owner?.extraPhone,
    'owner.email': context.owner?.email,
    'owner.address': context.owner?.address,
    'animal.nickname': context.animal?.nickname,
    'animal.species': context.animal?.species,
    'animal.breed': context.animal?.breed,
    'appointment.startsAt': formatDateTime(context.scheduledAt),
    'appointment.date': formatDate(context.scheduledAt),
    'appointment.time': formatTime(context.scheduledAt),
    currentDate: formatDate(new Date()),
    currentDateTime: formatDateTime(new Date()),
    'Organization.title': context.organization?.displayName,
    'Organization.type': context.organization?.orgType,
    'Organization.Office.phonePrimary': context.office?.phone,
    'Owner.fullName': context.owner?.fullName,
    'Owner.phone': context.owner?.phone,
    'Animal.nick': context.animal?.nickname,
    'Animal.species': context.animal?.species,
    'Appointment.date': formatDate(context.scheduledAt),
    'Appointment.time': formatTime(context.scheduledAt),
  };

  return text.replace(/\{\{\s*([\w.]+)\s*\}\}|\{([\w.]+)\}/g, (_match, doubleBraceKey: string | undefined, singleBraceKey: string | undefined) => {
    const key = singleBraceKey ?? doubleBraceKey;
    return key ? (values[key] ?? '') : '';
  });
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('ru-RU');
}

function formatTime(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeOwnerMessengerChannel(value: string): OwnerMessengerChannel {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'MAX' || normalized === 'TELEGRAM') {
    return normalized;
  }

  throw new BadRequestException('Поддерживается сброс только MAX или Telegram');
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function toNotificationChannel(channel: PortalInviteChannel) {
  if (channel === PortalInviteChannel.MAX) {
    return NotificationChannel.MAX;
  }

  if (channel === PortalInviteChannel.TELEGRAM) {
    return NotificationChannel.TELEGRAM;
  }

  return null;
}

function getDirectInviteRecipient(
  owner: { telegramChatId: string | null; maxUserId: string | null },
  channel: PortalInviteChannel,
) {
  if (channel === PortalInviteChannel.MAX) {
    return owner.maxUserId;
  }

  if (channel === PortalInviteChannel.TELEGRAM) {
    return owner.telegramChatId;
  }

  return null;
}
