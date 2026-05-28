import { Injectable, NotFoundException } from '@nestjs/common';
import { AnimalSex, Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnimalDto } from './dto/create-animal.dto';
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
  ) {}

  async listOwners(query: ListOwnersQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.OwnerWhereInput = search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
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
    const owner = await this.prisma.owner.create({
      data: {
        fullName: dto.fullName,
        organizationName: dto.organizationName,
        phone: dto.phone,
        extraPhone: dto.extraPhone,
        email: dto.email,
        address: dto.address,
        source: dto.source,
        passportData: dto.passportData,
        comment: dto.comment,
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
    await this.ensureOwnerExists(ownerId);

    const owner = await this.prisma.owner.update({
      where: { id: ownerId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.organizationName !== undefined ? { organizationName: dto.organizationName || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        ...(dto.extraPhone !== undefined ? { extraPhone: dto.extraPhone || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.toLowerCase() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
        ...(dto.source !== undefined ? { source: dto.source || null } : {}),
        ...(dto.passportData !== undefined ? { passportData: dto.passportData || null } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment || null } : {}),
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

  async listOwnerAnimals(ownerId: string) {
    await this.ensureOwnerExists(ownerId);

    return this.prisma.animal.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAnimal(dto: CreateAnimalDto & { ownerId: string }, actorId: string) {
    await this.ensureOwnerExists(dto.ownerId);

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
      select: { id: true },
    });

    if (!owner) {
      throw new NotFoundException('Owner not found');
    }
  }
}
