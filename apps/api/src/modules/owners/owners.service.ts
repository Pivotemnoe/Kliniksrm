import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AnimalSex, ClientPortalStatus, Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import {
  formatNormalizedRussianPhone,
  normalizeDisplayName,
  normalizePersonNameKey,
  normalizePhoneForLookup,
  normalizePhoneSearch,
  normalizeRussianPhone,
} from '../../common/phone';
import { AuditService } from '../audit/audit.service';
import { AnimalCatalogService } from '../animals/animal-catalog.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { CreateOwnerBalanceOperationDto } from './dto/create-owner-balance-operation.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { CreateTrustedPersonDto } from './dto/create-trusted-person.dto';
import { ListOwnersQueryDto } from './dto/list-owners-query.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { UpdateTrustedPersonDto } from './dto/update-trusted-person.dto';

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly animalCatalogService: AnimalCatalogService,
  ) {}

  async listOwners(query: ListOwnersQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const phoneSearch = normalizePhoneSearch(search);
    const where: Prisma.OwnerWhereInput = search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { fullNameNormalized: { contains: normalizePersonNameKey(search), mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            ...(phoneSearch ? [{ phoneNormalized: { contains: phoneSearch } }] : []),
            { extraPhone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { animals: { some: { nickname: { contains: search, mode: 'insensitive' } } } },
            { animals: { some: { microchip: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.owner.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { animals: true, visits: true, bills: true },
          },
          animals: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              id: true,
              nickname: true,
              species: true,
              breed: true,
              sex: true,
              status: true,
            },
          },
        },
        skip: offset,
        take: limit,
      }),
      this.prisma.owner.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async createOwner(dto: CreateOwnerDto, actorId: string) {
    const fullName = normalizeDisplayName(dto.fullName);
    const fullNameNormalized = normalizePersonNameKey(fullName);
    const phoneNormalized = normalizePhoneForLookup(dto.phone);
    await this.ensureNoDuplicateOwner(fullNameNormalized, phoneNormalized);

    const owner = await this.prisma.owner.create({
      data: {
        fullName,
        fullNameNormalized,
        organizationName: nullableString(dto.organizationName),
        phone: formatNormalizedRussianPhone(phoneNormalized),
        phoneNormalized,
        extraPhone: normalizeRussianPhone(dto.extraPhone),
        email: dto.email?.trim().toLowerCase(),
        address: nullableString(dto.address),
        source: nullableString(dto.source),
        passportData: nullableString(dto.passportData),
        comment: nullableString(dto.comment),
        preferredNotificationChannel: dto.preferredNotificationChannel,
        telegramChatId: nullableString(dto.telegramChatId),
        maxUserId: nullableString(dto.maxUserId),
        allowSms: dto.allowSms,
        allowTelegram: dto.allowTelegram,
        allowMax: dto.allowMax,
        allowEmail: dto.allowEmail,
        goodsDiscount: dto.goodsDiscount,
        servicesDiscount: dto.servicesDiscount,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'owner.create',
      entityType: 'Owner',
      entityId: owner.id,
    });

    return owner;
  }

  async getOwner(ownerId: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      include: {
        animals: true,
        trustedPeople: true,
        _count: {
          select: {
            animals: true,
            appointments: true,
            visits: true,
            bills: true,
            tasks: true,
          },
        },
        balanceOperations: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    return owner;
  }

  async updateOwner(ownerId: string, dto: UpdateOwnerDto, actorId: string) {
    const existing = await this.ensureOwnerExists(ownerId);
    const fullName = dto.fullName !== undefined ? normalizeDisplayName(dto.fullName) : existing.fullName;
    const fullNameNormalized = normalizePersonNameKey(fullName);
    const phoneNormalized = dto.phone !== undefined ? normalizePhoneForLookup(dto.phone) : existing.phoneNormalized;
    await this.ensureNoDuplicateOwner(fullNameNormalized, phoneNormalized, ownerId);

    const owner = await this.prisma.owner.update({
      where: { id: ownerId },
      data: {
        ...(dto.fullName !== undefined ? { fullName } : {}),
        ...(dto.fullName !== undefined || dto.phone !== undefined ? { fullNameNormalized } : {}),
        ...(dto.organizationName !== undefined ? { organizationName: dto.organizationName || null } : {}),
        ...(dto.phone !== undefined ? { phone: formatNormalizedRussianPhone(phoneNormalized), phoneNormalized } : {}),
        ...(dto.extraPhone !== undefined ? { extraPhone: normalizeRussianPhone(dto.extraPhone) } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
        ...(dto.source !== undefined ? { source: dto.source || null } : {}),
        ...(dto.passportData !== undefined ? { passportData: dto.passportData || null } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment || null } : {}),
        ...(dto.preferredNotificationChannel !== undefined ? { preferredNotificationChannel: dto.preferredNotificationChannel || null } : {}),
        ...(dto.telegramChatId !== undefined ? { telegramChatId: dto.telegramChatId || null } : {}),
        ...(dto.maxUserId !== undefined ? { maxUserId: dto.maxUserId || null } : {}),
        ...(dto.allowSms !== undefined ? { allowSms: dto.allowSms } : {}),
        ...(dto.allowTelegram !== undefined ? { allowTelegram: dto.allowTelegram } : {}),
        ...(dto.allowMax !== undefined ? { allowMax: dto.allowMax } : {}),
        ...(dto.allowEmail !== undefined ? { allowEmail: dto.allowEmail } : {}),
        ...(dto.goodsDiscount !== undefined ? { goodsDiscount: dto.goodsDiscount } : {}),
        ...(dto.servicesDiscount !== undefined ? { servicesDiscount: dto.servicesDiscount } : {}),
      },
    });

    await this.auditService.log({
      actorId,
      action: 'owner.update',
      entityType: 'Owner',
      entityId: owner.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return owner;
  }

  async mergeOwner(targetOwnerId: string, sourceOwnerId: string, actorId: string) {
    if (targetOwnerId === sourceOwnerId) {
      throw new BadRequestException('Нельзя объединить владельца с самим собой');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [targetOwner, sourceOwner] = await Promise.all([
        tx.owner.findUnique({
          where: { id: targetOwnerId },
          include: { portalAccess: true },
        }),
        tx.owner.findUnique({
          where: { id: sourceOwnerId },
          include: { portalAccess: true },
        }),
      ]);

      if (!targetOwner) {
        throw new NotFoundException('Основная карточка владельца не найдена');
      }

      if (!sourceOwner) {
        throw new NotFoundException('Карточка-дубль владельца не найдена');
      }

      await this.mergePortalAccess(tx, targetOwner, sourceOwner);

      await Promise.all([
        tx.animal.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.trustedPerson.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.queueEntry.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.appointment.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.visit.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.task.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.bill.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.sale.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.ownerBalanceOperation.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.notificationOutbox.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
        tx.onlineAppointmentRequest.updateMany({ where: { ownerId: sourceOwnerId }, data: { ownerId: targetOwnerId } }),
      ]);

      const mergedOwner = await tx.owner.update({
        where: { id: targetOwnerId },
        data: {
          organizationName: targetOwner.organizationName ?? sourceOwner.organizationName,
          phone: targetOwner.phone ?? sourceOwner.phone,
          phoneNormalized: targetOwner.phoneNormalized ?? sourceOwner.phoneNormalized,
          extraPhone: mergeExtraPhone(targetOwner.extraPhone, sourceOwner.phone, sourceOwner.extraPhone),
          email: targetOwner.email ?? sourceOwner.email,
          address: targetOwner.address ?? sourceOwner.address,
          source: targetOwner.source ?? sourceOwner.source,
          passportData: targetOwner.passportData ?? sourceOwner.passportData,
          comment: mergeOwnerComment(targetOwner.comment, sourceOwner.comment, sourceOwner.fullName),
          preferredNotificationChannel: targetOwner.preferredNotificationChannel ?? sourceOwner.preferredNotificationChannel,
          telegramChatId: targetOwner.telegramChatId ?? sourceOwner.telegramChatId,
          maxUserId: targetOwner.maxUserId ?? sourceOwner.maxUserId,
          allowSms: targetOwner.allowSms || sourceOwner.allowSms,
          allowTelegram: targetOwner.allowTelegram || sourceOwner.allowTelegram,
          allowMax: targetOwner.allowMax || sourceOwner.allowMax,
          allowEmail: targetOwner.allowEmail || sourceOwner.allowEmail,
          goodsDiscount: maxDecimal(targetOwner.goodsDiscount, sourceOwner.goodsDiscount),
          servicesDiscount: maxDecimal(targetOwner.servicesDiscount, sourceOwner.servicesDiscount),
          balance: { increment: sourceOwner.balance },
        },
      });

      await tx.owner.delete({ where: { id: sourceOwnerId } });

      return mergedOwner;
    });

    await this.auditService.log({
      actorId,
      action: 'owner.merge',
      entityType: 'Owner',
      entityId: targetOwnerId,
      metadata: { sourceOwnerId, targetOwnerId },
    });

    return this.getOwner(result.id);
  }

  private async mergePortalAccess(
    tx: Prisma.TransactionClient,
    targetOwner: Prisma.OwnerGetPayload<{ include: { portalAccess: true } }>,
    sourceOwner: Prisma.OwnerGetPayload<{ include: { portalAccess: true } }>,
  ) {
    const sourceAccess = sourceOwner.portalAccess;

    if (!sourceAccess) {
      return;
    }

    const targetAccess = targetOwner.portalAccess;

    if (!targetAccess) {
      await tx.clientPortalAccess.update({
        where: { id: sourceAccess.id },
        data: { ownerId: targetOwner.id },
      });
      return;
    }

    await tx.clientPortalAccess.update({
      where: { id: targetAccess.id },
      data: {
        status: choosePortalStatus(targetAccess.status, sourceAccess.status),
        inviteTokenHash: targetAccess.inviteTokenHash ?? sourceAccess.inviteTokenHash,
        inviteExpiresAt: latestDate(targetAccess.inviteExpiresAt, sourceAccess.inviteExpiresAt),
        invitedAt: targetAccess.invitedAt ?? sourceAccess.invitedAt,
        lastLoginAt: latestDate(targetAccess.lastLoginAt, sourceAccess.lastLoginAt),
        loginCodeHash: targetAccess.loginCodeHash ?? sourceAccess.loginCodeHash,
        loginCodeExpiresAt: latestDate(targetAccess.loginCodeExpiresAt, sourceAccess.loginCodeExpiresAt),
        loginCodeAttempts: Math.max(targetAccess.loginCodeAttempts, sourceAccess.loginCodeAttempts),
        blockedReason: targetAccess.blockedReason ?? sourceAccess.blockedReason,
      },
    });

    await tx.clientPortalAccess.delete({ where: { id: sourceAccess.id } });
  }

  async createBalanceOperation(ownerId: string, dto: CreateOwnerBalanceOperationDto, actorId: string) {
    const amount = decimal(dto.amount);

    if (amount.equals(0)) {
      throw new BadRequestException('Сумма операции не может быть нулевой');
    }

    const owner = await this.prisma.$transaction(async (tx) => {
      const existingOwner = await tx.owner.findUnique({
        where: { id: ownerId },
        select: { id: true, balance: true },
      });

      if (!existingOwner) {
        throw new NotFoundException('Owner not found');
      }

      const nextBalance = decimal(existingOwner.balance).plus(amount);
      if (nextBalance.lessThan(0)) {
        throw new BadRequestException('Баланс владельца не может уйти в минус');
      }

      await tx.ownerBalanceOperation.create({
        data: {
          ownerId,
          type: dto.type,
          amount,
          comment: dto.comment?.trim() || null,
        },
      });

      return tx.owner.update({
        where: { id: ownerId },
        data: { balance: { increment: amount } },
      });
    });

    await this.auditService.log({
      actorId,
      action: 'owner.balance_operation.create',
      entityType: 'Owner',
      entityId: ownerId,
      metadata: { amount, type: dto.type },
    });

    return this.getOwner(owner.id);
  }

  async listOwnerAnimals(ownerId: string) {
    await this.ensureOwnerExists(ownerId);

    return this.prisma.animal.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAnimal(dto: CreateAnimalDto & { ownerId: string }, actorId: string) {
    await this.ensureOwnerExists(dto.ownerId);
    await this.animalCatalogService.validateSelection(dto.species, dto.breed);

    const animal = await this.prisma.animal.create({
      data: {
        ownerId: dto.ownerId,
        nickname: dto.nickname,
        species: dto.species,
        breed: dto.breed,
        sex: dto.sex as AnimalSex | undefined,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        color: dto.color,
        microchip: dto.microchip,
        mark: dto.mark,
        comment: dto.comment,
        isSterilized: dto.isSterilized,
        isFavorite: dto.isFavorite,
        status: dto.status,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'animal.create',
      entityType: 'Animal',
      entityId: animal.id,
      metadata: { ownerId: dto.ownerId },
    });

    return animal;
  }

  async listTrustedPeople(ownerId: string) {
    await this.ensureOwnerExists(ownerId);

    return this.prisma.trustedPerson.findMany({
      where: { ownerId },
      orderBy: { fullName: 'asc' },
    });
  }

  async createTrustedPerson(ownerId: string, dto: CreateTrustedPersonDto, actorId: string) {
    await this.ensureOwnerExists(ownerId);

    const trustedPerson = await this.prisma.trustedPerson.create({
      data: {
        ownerId,
        fullName: dto.fullName,
        phone: dto.phone,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'trusted_person.create',
      entityType: 'TrustedPerson',
      entityId: trustedPerson.id,
      metadata: { ownerId },
    });

    return trustedPerson;
  }

  async updateTrustedPerson(ownerId: string, trustedPersonId: string, dto: UpdateTrustedPersonDto, actorId: string) {
    const trustedPerson = await this.prisma.trustedPerson.findFirst({
      where: { id: trustedPersonId, ownerId },
      select: { id: true },
    });

    if (!trustedPerson) {
      throw new NotFoundException('Trusted person not found');
    }

    const updatedTrustedPerson = await this.prisma.trustedPerson.update({
      where: { id: trustedPersonId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
      },
    });

    await this.auditService.log({
      actorId,
      action: 'trusted_person.update',
      entityType: 'TrustedPerson',
      entityId: trustedPersonId,
      metadata: { ownerId, changedFields: Object.keys(dto) },
    });

    return updatedTrustedPerson;
  }

  private async ensureOwnerExists(ownerId: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true, fullName: true, phoneNormalized: true },
    });

    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    return owner;
  }

  private async ensureNoDuplicateOwner(fullNameNormalized: string, phoneNormalized: string | null, excludeOwnerId?: string) {
    if (!phoneNormalized) {
      return;
    }

    const duplicate = await this.prisma.owner.findFirst({
      where: {
        fullNameNormalized,
        phoneNormalized,
        ...(excludeOwnerId ? { id: { not: excludeOwnerId } } : {}),
      },
      select: { id: true, fullName: true, phone: true },
    });

    if (!duplicate) {
      return;
    }

    throw new ConflictException(
      `Владелец "${duplicate.fullName}" с телефоном ${duplicate.phone ?? formatNormalizedRussianPhone(phoneNormalized)} уже есть. Откройте существующую карточку владельца, чтобы не создавать дубль.`,
    );
  }
}

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function maxDecimal(left: Prisma.Decimal.Value, right: Prisma.Decimal.Value) {
  const leftDecimal = decimal(left);
  const rightDecimal = decimal(right);
  return leftDecimal.greaterThan(rightDecimal) ? leftDecimal : rightDecimal;
}

function mergeExtraPhone(currentExtraPhone?: string | null, sourcePhone?: string | null, sourceExtraPhone?: string | null) {
  const phones = [currentExtraPhone, sourcePhone, sourceExtraPhone]
    .map((phone) => normalizeRussianPhone(phone))
    .filter(Boolean);

  return phones[0] ?? null;
}

function mergeOwnerComment(currentComment?: string | null, sourceComment?: string | null, sourceOwnerName?: string | null) {
  const source = sourceComment?.trim();

  if (!source) {
    return currentComment ?? null;
  }

  if (!currentComment?.trim()) {
    return source;
  }

  return `${currentComment.trim()}\n\nКомментарий из объединённой карточки ${sourceOwnerName ?? 'владельца'}:\n${source}`;
}

function choosePortalStatus(current: ClientPortalStatus, source: ClientPortalStatus) {
  const priority: Record<ClientPortalStatus, number> = {
    [ClientPortalStatus.DISABLED]: 0,
    [ClientPortalStatus.INVITED]: 1,
    [ClientPortalStatus.ENABLED]: 2,
    [ClientPortalStatus.BLOCKED]: 3,
  };

  return priority[source] > priority[current] ? source : current;
}

function latestDate(left?: Date | null, right?: Date | null) {
  if (!left) {
    return right ?? null;
  }

  if (!right) {
    return left;
  }

  return left > right ? left : right;
}

function nullableString(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
