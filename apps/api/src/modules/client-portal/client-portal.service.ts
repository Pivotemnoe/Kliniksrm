import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientPortalStatus, DocumentStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePortalOnlineRequestDto } from './dto/create-portal-online-request.dto';
import { RequestPortalCodeDto } from './dto/request-portal-code.dto';
import { VerifyPortalCodeDto } from './dto/verify-portal-code.dto';

const PORTAL_CODE_TTL_MINUTES = Number(process.env.CLIENT_PORTAL_CODE_TTL_MINUTES ?? 10);
const PORTAL_CODE_MAX_ATTEMPTS = Number(process.env.CLIENT_PORTAL_CODE_MAX_ATTEMPTS ?? 5);
const PORTAL_PHONE_TOKEN_DAYS = Number(process.env.CLIENT_PORTAL_PHONE_TOKEN_DAYS ?? 30);
const PORTAL_ONLINE_REQUESTS_ENABLED = process.env.CLIENT_PORTAL_ONLINE_REQUESTS_ENABLED === 'true';

@Injectable()
export class ClientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async requestLoginCode(dto: RequestPortalCodeDto) {
    const owner = await this.findPortalOwnerByPhone(dto.phone);
    const access = this.requirePhoneLoginAccess(owner.portalAccess);
    const code = randomInt(100000, 1000000).toString();
    const expiresAt = addMinutes(new Date(), PORTAL_CODE_TTL_MINUTES);

    await this.prisma.clientPortalAccess.update({
      where: { id: access.id },
      data: {
        loginCodeHash: hashPortalCode(access.id, code),
        loginCodeExpiresAt: expiresAt,
        loginCodeAttempts: 0,
      },
    });

    await this.auditService.log({
      action: 'client_portal.code_request',
      entityType: 'ClientPortalAccess',
      entityId: access.id,
      metadata: { ownerId: owner.id, channel: getPortalDeliveryChannel(owner) },
    });

    return {
      ok: true,
      expiresAt,
      deliveryChannel: getPortalDeliveryChannel(owner),
      debugCode: shouldExposePortalCode() ? code : undefined,
    };
  }

  async verifyLoginCode(dto: VerifyPortalCodeDto) {
    const owner = await this.findPortalOwnerByPhone(dto.phone);
    const access = this.requirePhoneLoginAccess(owner.portalAccess);

    if (!access.loginCodeHash || !access.loginCodeExpiresAt) {
      throw new BadRequestException('Сначала запросите код подтверждения');
    }

    if (access.loginCodeExpiresAt < new Date()) {
      throw new BadRequestException('Срок действия кода истёк');
    }

    if (access.loginCodeAttempts >= PORTAL_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException('Слишком много попыток. Запросите новый код');
    }

    const code = dto.code.trim();
    const isValid = access.loginCodeHash === hashPortalCode(access.id, code);

    if (!isValid) {
      await this.prisma.clientPortalAccess.update({
        where: { id: access.id },
        data: { loginCodeAttempts: { increment: 1 } },
      });

      throw new BadRequestException('Неверный код подтверждения');
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = addDays(new Date(), PORTAL_PHONE_TOKEN_DAYS);
    const updatedAccess = await this.prisma.clientPortalAccess.update({
      where: { id: access.id },
      data: {
        status: ClientPortalStatus.ENABLED,
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: expiresAt,
        invitedAt: access.invitedAt ?? new Date(),
        lastLoginAt: new Date(),
        loginCodeHash: null,
        loginCodeExpiresAt: null,
        loginCodeAttempts: 0,
      },
    });

    await this.auditService.log({
      action: 'client_portal.login',
      entityType: 'ClientPortalAccess',
      entityId: updatedAccess.id,
      metadata: { ownerId: owner.id, method: 'phone_code' },
    });

    return {
      token,
      expiresAt,
    };
  }

  async getSummary(token: string) {
    const access = await this.resolveAccess(token);
    const ownerId = access.ownerId;
    const snapshot = await this.buildOwnerGatewaySnapshot(ownerId);

    return {
      access: {
        status: access.status,
        invitedAt: access.invitedAt,
        inviteExpiresAt: access.inviteExpiresAt,
        lastLoginAt: access.lastLoginAt,
      },
      owner: { ...snapshot.owner, animals: snapshot.animals },
      appointments: snapshot.appointments,
      visits: snapshot.visits,
      bills: snapshot.bills,
      notifications: snapshot.notifications,
      onlineRequests: [],
    };
  }

  async buildOwnerGatewaySnapshot(ownerId: string) {
    const [owner, appointments, visits, bills, notifications] = await this.prisma.$transaction([
      this.prisma.owner.findUnique({
        where: { id: ownerId },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          address: true,
          balance: true,
          animals: {
            orderBy: { nickname: 'asc' },
            select: {
              id: true,
              nickname: true,
              species: true,
              breed: true,
              sex: true,
              birthDate: true,
              color: true,
              microchip: true,
              status: true,
              weights: {
                orderBy: { measuredAt: 'desc' },
                take: 1,
                select: { id: true, weightKg: true, measuredAt: true },
              },
              vaccinations: {
                orderBy: [{ expiresAt: 'asc' }, { vaccinatedAt: 'desc' }],
                take: 8,
                select: { id: true, title: true, status: true, vaccinatedAt: true, expiresAt: true },
              },
            },
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: { ownerId },
        orderBy: { startsAt: 'desc' },
        take: 30,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          animal: { select: { id: true, nickname: true, species: true } },
          employee: { select: { id: true, fullName: true, position: true } },
          room: { select: { id: true, name: true } },
        },
      }),
      this.prisma.visit.findMany({
        where: { ownerId, status: 'COMPLETED' },
        orderBy: { startedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          totalAmount: true,
          animal: { select: { id: true, nickname: true, species: true } },
          employee: { select: { id: true, fullName: true, position: true } },
          diagnoses: { select: { id: true, title: true, status: true } },
          recommendation: { select: { treatmentPlan: true, careNotes: true } },
          documents: {
            where: { status: DocumentStatus.SIGNED },
            select: { id: true, title: true, body: true, status: true, createdAt: true },
          },
        },
      }),
      this.prisma.bill.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          status: true,
          source: true,
          totalAmount: true,
          paidAmount: true,
          createdAt: true,
          animal: { select: { id: true, nickname: true } },
          items: { select: { id: true, title: true, quantity: true, totalAmount: true } },
        },
      }),
      this.prisma.notificationOutbox.findMany({
        where: {
          ownerId,
          channel: { not: 'INTERNAL' },
          OR: [{ status: 'SENT' }, { channel: 'MESSENGER' }],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          channel: true,
          subject: true,
          body: true,
          status: true,
          scheduledAt: true,
          sentAt: true,
          createdAt: true,
          metadata: true,
        },
      }),
    ]);

    if (!owner) {
      throw new NotFoundException('Владелец не найден');
    }

    const { animals, ...ownerProfile } = owner;
    const visibleNotifications = notifications
      .filter((notification) => notification.status === 'SENT' || getPortalDeliveredAt(notification.metadata))
      .slice(0, 20)
      .map(({ metadata, ...notification }) => {
        const portalDeliveredAt = getPortalDeliveredAt(metadata);
        return {
          ...notification,
          channel: 'Сообщение клиники',
          status: 'SENT',
          sentAt: notification.sentAt ?? portalDeliveredAt,
        };
      });

    return {
      owner: ownerProfile,
      animals,
      appointments,
      visits,
      bills,
      notifications: visibleNotifications,
      syncedAt: new Date().toISOString(),
    };
  }

  async createOnlineRequest(token: string, dto: CreatePortalOnlineRequestDto) {
    if (!PORTAL_ONLINE_REQUESTS_ENABLED) {
      throw new ForbiddenException('Онлайн-запись через личный кабинет пока отключена');
    }

    const access = await this.resolveAccess(token);
    const owner = await this.prisma.owner.findUnique({
      where: { id: access.ownerId },
      select: { id: true, fullName: true, phone: true, email: true },
    });

    if (!owner) {
      throw new NotFoundException('Владелец не найден');
    }

    const animal = dto.animalId
      ? await this.prisma.animal.findFirst({
          where: { id: dto.animalId, ownerId: owner.id },
          select: { id: true, nickname: true, species: true, breed: true },
        })
      : null;

    if (dto.animalId && !animal) {
      throw new BadRequestException('Пациент не найден в личном кабинете владельца');
    }

    const preferredAt = dto.preferredAt ? new Date(dto.preferredAt) : null;
    if (preferredAt && Number.isNaN(preferredAt.getTime())) {
      throw new BadRequestException('Укажите корректную дату записи');
    }

    const animalNickname = required(animal?.nickname ?? dto.animalNickname, 'Укажите пациента');
    const request = await this.prisma.onlineAppointmentRequest.create({
      data: {
        source: 'CLIENT_PORTAL',
        ownerId: owner.id,
        animalId: animal?.id ?? null,
        ownerName: owner.fullName,
        phone: required(owner.phone, 'В карточке владельца нет телефона'),
        email: emptyToNull(owner.email),
        animalNickname,
        animalSpecies: emptyToNull(animal?.species ?? dto.animalSpecies),
        animalBreed: emptyToNull(animal?.breed ?? dto.animalBreed),
        preferredAt,
        comment: emptyToNull(dto.comment),
      },
      include: {
        animal: { select: { id: true, nickname: true, species: true, breed: true } },
        owner: { select: { id: true, fullName: true, phone: true } },
      },
    });

    await this.auditService.log({
      action: 'client_portal.online_request_create',
      entityType: 'OnlineAppointmentRequest',
      entityId: request.id,
      metadata: { ownerId: owner.id, animalId: request.animalId, source: request.source },
    });

    return request;
  }

  private async resolveAccess(token: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new ForbiddenException('Ссылка личного кабинета недействительна');
    }

    const access = await this.prisma.clientPortalAccess.findFirst({
      where: { inviteTokenHash: hashToken(normalizedToken) },
    });

    if (!access) {
      throw new ForbiddenException('Ссылка личного кабинета недействительна');
    }

    if (access.status === ClientPortalStatus.DISABLED) {
      throw new ForbiddenException('Личный кабинет выключен');
    }

    if (access.status === ClientPortalStatus.BLOCKED) {
      throw new ForbiddenException(access.blockedReason ?? 'Личный кабинет заблокирован');
    }

    if (access.inviteExpiresAt && access.inviteExpiresAt < new Date()) {
      throw new ForbiddenException('Срок действия ссылки истёк');
    }

    return this.prisma.clientPortalAccess.update({
      where: { id: access.id },
      data: {
        status: access.status === ClientPortalStatus.INVITED ? ClientPortalStatus.ENABLED : access.status,
        lastLoginAt: new Date(),
      },
    });
  }

  private async findPortalOwnerByPhone(phone: string) {
    const phoneKey = getPhoneLookupKey(phone);
    const owners = await this.prisma.owner.findMany({
      where: { phone: { not: null } },
      take: 1000,
      include: { portalAccess: true },
    });
    const matchedOwners = owners.filter((owner) => normalizePhone(owner.phone).endsWith(phoneKey));

    if (!matchedOwners.length) {
      throw new NotFoundException('Владелец с таким телефоном не найден');
    }

    if (matchedOwners.length > 1) {
      throw new BadRequestException('По этому телефону найдено несколько владельцев. Обратитесь в клинику');
    }

    return matchedOwners[0];
  }

  private requirePhoneLoginAccess(access: PortalAccessForLogin | null) {
    if (!access || access.status === ClientPortalStatus.DISABLED) {
      throw new ForbiddenException('Личный кабинет для этого телефона ещё не включён');
    }

    if (access.status === ClientPortalStatus.BLOCKED) {
      throw new ForbiddenException(access.blockedReason ?? 'Личный кабинет заблокирован');
    }

    return access;
  }
}

function getPortalDeliveredAt(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const delivery = metadata.delivery;
  if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) {
    return null;
  }
  return typeof delivery.portalDeliveredAt === 'string' ? delivery.portalDeliveredAt : null;
}

type PortalOwnerForLogin = Prisma.OwnerGetPayload<{ include: { portalAccess: true } }>;
type PortalAccessForLogin = NonNullable<PortalOwnerForLogin['portalAccess']>;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function hashPortalCode(accessId: string, code: string) {
  return createHash('sha256').update(`${accessId}:${code}`).digest('hex');
}

function normalizePhone(phone?: string | null) {
  return (phone ?? '').replace(/\D/g, '');
}

function getPhoneLookupKey(phone: string) {
  const normalized = normalizePhone(phone);

  if (normalized.length < 7) {
    throw new BadRequestException('Укажите телефон полностью');
  }

  return normalized.length > 10 ? normalized.slice(-10) : normalized;
}

function getPortalDeliveryChannel(owner: Pick<PortalOwnerForLogin, 'allowTelegram' | 'allowMax' | 'allowSms' | 'allowEmail' | 'telegramChatId' | 'maxUserId' | 'email'>) {
  if (owner.allowTelegram && owner.telegramChatId) {
    return 'TELEGRAM';
  }

  if (owner.allowMax && owner.maxUserId) {
    return 'MAX';
  }

  if (owner.allowSms) {
    return 'SMS';
  }

  if (owner.allowEmail && owner.email) {
    return 'EMAIL';
  }

  return 'LOCAL';
}

function shouldExposePortalCode() {
  return process.env.CLIENT_PORTAL_DEBUG_CODES === 'true' || process.env.NODE_ENV !== 'production';
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function required(value: string | null | undefined, message: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new BadRequestException(message);
  }

  return trimmed;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
