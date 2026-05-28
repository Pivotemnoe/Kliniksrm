import { Injectable, NotFoundException } from '@nestjs/common';
import { AnimalSex } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async createOwner(dto: CreateOwnerDto) {
    return this.prisma.owner.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        comment: dto.comment,
      },
    });
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

  async createAnimal(dto: CreateAnimalDto & { ownerId: string }) {
    await this.ensureOwnerExists(dto.ownerId);

    return this.prisma.animal.create({
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
