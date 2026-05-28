import { Injectable, NotFoundException } from '@nestjs/common';
import { AnimalSex } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listOwners() {
    return this.prisma.owner.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { animals: true },
        },
      },
      take: 100,
    });
  }

  async createOwner(dto: CreateOwnerDto, actorId: string) {
    const owner = await this.prisma.owner.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        comment: dto.comment,
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
        microchip: dto.microchip,
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
