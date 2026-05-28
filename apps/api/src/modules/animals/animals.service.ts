import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CreateWeightRecordDto } from './dto/create-weight-record.dto';
import { ListAnimalsQueryDto } from './dto/list-animals-query.dto';
import { UpdateAnimalDto } from './dto/update-animal.dto';
import { UpdateVaccinationDto } from './dto/update-vaccination.dto';

@Injectable()
export class AnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listAnimals(query: ListAnimalsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.AnimalWhereInput = {
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(search
        ? {
            OR: [
              { nickname: { contains: search, mode: 'insensitive' } },
              { species: { contains: search, mode: 'insensitive' } },
              { breed: { contains: search, mode: 'insensitive' } },
              { microchip: { contains: search, mode: 'insensitive' } },
              { owner: { fullName: { contains: search, mode: 'insensitive' } } },
              { owner: { phone: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.animal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              extraPhone: true,
            },
          },
          weights: {
            orderBy: { measuredAt: 'desc' },
            take: 1,
          },
          vaccinations: {
            orderBy: { expiresAt: 'asc' },
            take: 3,
          },
          _count: {
            select: {
              visits: true,
              tasks: true,
              vaccinations: true,
            },
          },
        },
        skip: offset,
        take: limit,
      }),
      this.prisma.animal.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async getAnimal(animalId: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      include: {
        owner: true,
        weights: {
          orderBy: { measuredAt: 'desc' },
          take: 20,
        },
        vaccinations: {
          orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
        },
        _count: {
          select: {
            appointments: true,
            visits: true,
            tasks: true,
            bills: true,
            vaccinations: true,
          },
        },
      },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }

    return animal;
  }

  async updateAnimal(animalId: string, dto: UpdateAnimalDto, actorId: string) {
    await this.ensureAnimalExists(animalId);

    const animal = await this.prisma.animal.update({
      where: { id: animalId },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
        ...(dto.species !== undefined ? { species: dto.species || null } : {}),
        ...(dto.breed !== undefined ? { breed: dto.breed || null } : {}),
        ...(dto.sex !== undefined ? { sex: dto.sex } : {}),
        ...(dto.birthDate !== undefined ? { birthDate: dto.birthDate ? new Date(dto.birthDate) : null } : {}),
        ...(dto.color !== undefined ? { color: dto.color || null } : {}),
        ...(dto.microchip !== undefined ? { microchip: dto.microchip || null } : {}),
        ...(dto.mark !== undefined ? { mark: dto.mark || null } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment || null } : {}),
        ...(dto.isSterilized !== undefined ? { isSterilized: dto.isSterilized } : {}),
        ...(dto.isFavorite !== undefined ? { isFavorite: dto.isFavorite } : {}),
        ...(dto.status !== undefined ? { status: dto.status || null } : {}),
      },
    });

    await this.auditService.log({
      actorId,
      action: 'animal.update',
      entityType: 'Animal',
      entityId: animal.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return animal;
  }

  async listWeightRecords(animalId: string) {
    await this.ensureAnimalExists(animalId);

    return this.prisma.animalWeightRecord.findMany({
      where: { animalId },
      orderBy: { measuredAt: 'desc' },
      take: 100,
    });
  }

  async createWeightRecord(animalId: string, dto: CreateWeightRecordDto, actorId: string) {
    await this.ensureAnimalExists(animalId);

    const weightRecord = await this.prisma.animalWeightRecord.create({
      data: {
        animalId,
        weightKg: dto.weightKg,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : undefined,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'animal_weight.create',
      entityType: 'AnimalWeightRecord',
      entityId: weightRecord.id,
      metadata: { animalId },
    });

    return weightRecord;
  }

  async listVaccinations(animalId: string) {
    await this.ensureAnimalExists(animalId);

    return this.prisma.vaccination.findMany({
      where: { animalId },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createVaccination(animalId: string, dto: CreateVaccinationDto, actorId: string) {
    await this.ensureAnimalExists(animalId);

    const vaccination = await this.prisma.vaccination.create({
      data: {
        animalId,
        title: dto.title,
        status: dto.status,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        notes: dto.notes,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'vaccination.create',
      entityType: 'Vaccination',
      entityId: vaccination.id,
      metadata: { animalId },
    });

    return vaccination;
  }

  async updateVaccination(animalId: string, vaccinationId: string, dto: UpdateVaccinationDto, actorId: string) {
    const vaccination = await this.prisma.vaccination.findFirst({
      where: { id: vaccinationId, animalId },
      select: { id: true },
    });

    if (!vaccination) {
      throw new NotFoundException('Vaccination not found');
    }

    const updatedVaccination = await this.prisma.vaccination.update({
      where: { id: vaccinationId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.status !== undefined ? { status: dto.status || null } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
      },
    });

    await this.auditService.log({
      actorId,
      action: 'vaccination.update',
      entityType: 'Vaccination',
      entityId: vaccinationId,
      metadata: { animalId, changedFields: Object.keys(dto) },
    });

    return updatedVaccination;
  }

  private async ensureAnimalExists(animalId: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      select: { id: true },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }
  }
}

