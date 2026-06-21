import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CreateWeightRecordDto } from './dto/create-weight-record.dto';
import { ListAnimalsQueryDto } from './dto/list-animals-query.dto';
import { UpdateAnimalDto } from './dto/update-animal.dto';
import { UpdateVaccinationDto } from './dto/update-vaccination.dto';
import { AnimalCatalogService } from './animal-catalog.service';

@Injectable()
export class AnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly animalCatalogService: AnimalCatalogService,
    private readonly schedulingService: SchedulingService,
  ) {}

  listCatalog() {
    return this.animalCatalogService.listCatalog();
  }

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
    if (dto.species !== undefined || dto.breed !== undefined) {
      await this.animalCatalogService.validateSelection(dto.species, dto.breed);
    }

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
      include: vaccinationInclude,
    });
  }

  async createVaccination(animalId: string, dto: CreateVaccinationDto, actorId: string) {
    const animal = await this.getAnimalForVaccination(animalId);
    await this.validateRevaccinationAssignment(dto);
    let taskAudit: TaskAudit | null = null;

    const vaccination = await this.prisma.$transaction(async (tx) => {
      const createdVaccination = await tx.vaccination.create({
        data: {
          animalId,
          title: dto.title,
          status: emptyToNull(dto.status),
          vaccinatedAt: dateOrNull(dto.vaccinatedAt),
          expiresAt: dateOrNull(dto.expiresAt),
          vaccineBatch: emptyToNull(dto.vaccineBatch),
          vaccineSeries: emptyToNull(dto.vaccineSeries),
          vaccineExpiresAt: dateOrNull(dto.vaccineExpiresAt),
          smsReminder: dto.smsReminder ?? false,
          notes: emptyToNull(dto.notes),
        },
        include: vaccinationInclude,
      });

      taskAudit = await this.syncRevaccinationTask(tx, animal, createdVaccination, dto, actorId);

      return tx.vaccination.findUniqueOrThrow({
        where: { id: createdVaccination.id },
        include: vaccinationInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'vaccination.create',
      entityType: 'Vaccination',
      entityId: vaccination.id,
      metadata: { animalId, revaccinationTaskId: vaccination.revaccinationTask?.id ?? null },
    });
    await this.logTaskAudit(taskAudit, actorId);

    return vaccination;
  }

  async updateVaccination(animalId: string, vaccinationId: string, dto: UpdateVaccinationDto, actorId: string) {
    const vaccination = await this.prisma.vaccination.findFirst({
      where: { id: vaccinationId, animalId },
      include: vaccinationInclude,
    });

    if (!vaccination) {
      throw new NotFoundException('Vaccination not found');
    }
    const animal = await this.getAnimalForVaccination(animalId);
    await this.validateRevaccinationAssignment(dto);
    let taskAudit: TaskAudit | null = null;

    const updatedVaccination = await this.prisma.$transaction(async (tx) => {
      const savedVaccination = await tx.vaccination.update({
        where: { id: vaccinationId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.status !== undefined ? { status: emptyToNull(dto.status) } : {}),
          ...(dto.vaccinatedAt !== undefined ? { vaccinatedAt: dateOrNull(dto.vaccinatedAt) } : {}),
          ...(dto.expiresAt !== undefined ? { expiresAt: dateOrNull(dto.expiresAt) } : {}),
          ...(dto.vaccineBatch !== undefined ? { vaccineBatch: emptyToNull(dto.vaccineBatch) } : {}),
          ...(dto.vaccineSeries !== undefined ? { vaccineSeries: emptyToNull(dto.vaccineSeries) } : {}),
          ...(dto.vaccineExpiresAt !== undefined ? { vaccineExpiresAt: dateOrNull(dto.vaccineExpiresAt) } : {}),
          ...(dto.smsReminder !== undefined ? { smsReminder: dto.smsReminder } : {}),
          ...(dto.notes !== undefined ? { notes: emptyToNull(dto.notes) } : {}),
        },
        include: vaccinationInclude,
      });

      taskAudit = await this.syncRevaccinationTask(tx, animal, savedVaccination, dto, actorId);

      return tx.vaccination.findUniqueOrThrow({
        where: { id: vaccinationId },
        include: vaccinationInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'vaccination.update',
      entityType: 'Vaccination',
      entityId: vaccinationId,
      metadata: {
        animalId,
        changedFields: Object.keys(dto),
        revaccinationTaskId: updatedVaccination.revaccinationTask?.id ?? null,
      },
    });
    await this.logTaskAudit(taskAudit, actorId);

    return updatedVaccination;
  }

  private async getAnimalForVaccination(animalId: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      select: {
        id: true,
        ownerId: true,
        nickname: true,
        species: true,
        breed: true,
      },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }

    return animal;
  }

  private async syncRevaccinationTask(
    tx: Prisma.TransactionClient,
    animal: AnimalForVaccination,
    vaccination: VaccinationWithTask,
    dto: CreateVaccinationDto | UpdateVaccinationDto,
    actorId: string,
  ): Promise<TaskAudit | null> {
    if (!vaccination.expiresAt || dto.createRevaccinationTask === false) {
      return this.cancelOpenRevaccinationTask(tx, vaccination.revaccinationTask, vaccination.id);
    }

    const assignment = await this.resolveRevaccinationAssignment(tx, dto, vaccination.revaccinationTask);
    const baseData: Prisma.TaskUncheckedUpdateInput = {
      ownerId: animal.ownerId,
      animalId: animal.id,
      taskType: 'revaccination',
      title: `Ревакцинация: ${vaccination.title}`,
      comment: this.buildRevaccinationComment(animal, vaccination),
      dueAt: vaccination.expiresAt,
    };

    if (assignment.shouldPatch) {
      baseData.assigneeId = assignment.assigneeId;
      baseData.assigneeRoleCode = assignment.assigneeRoleCode;
    }

    if (vaccination.revaccinationTask) {
      if (vaccination.revaccinationTask.status === TaskStatus.DONE || vaccination.revaccinationTask.status === TaskStatus.ARCHIVED) {
        return null;
      }

      const task = await tx.task.update({
        where: { id: vaccination.revaccinationTask.id },
        data: {
          ...baseData,
          ...(vaccination.revaccinationTask.status === TaskStatus.CANCELLED ? { status: TaskStatus.OPEN } : {}),
        },
        select: { id: true, status: true },
      });

      return {
        action: 'task.update',
        taskId: task.id,
        metadata: { source: 'vaccination', sourceVaccinationId: vaccination.id, status: task.status },
      };
    }

    const task = await tx.task.create({
      data: {
        ...(baseData as Prisma.TaskUncheckedCreateInput),
        creatorId: actorId,
        sourceVaccinationId: vaccination.id,
        status: TaskStatus.OPEN,
      },
      select: { id: true, status: true },
    });

    return {
      action: 'task.create',
      taskId: task.id,
      metadata: { source: 'vaccination', sourceVaccinationId: vaccination.id, status: task.status },
    };
  }

  private async cancelOpenRevaccinationTask(
    tx: Prisma.TransactionClient,
    task: VaccinationTask | null,
    vaccinationId: string,
  ): Promise<TaskAudit | null> {
    if (!task || task.status !== TaskStatus.OPEN) {
      return null;
    }

    const cancelledTask = await tx.task.update({
      where: { id: task.id },
      data: { status: TaskStatus.CANCELLED },
      select: { id: true, status: true },
    });

    return {
      action: 'task.cancel',
      taskId: cancelledTask.id,
      metadata: { source: 'vaccination', sourceVaccinationId: vaccinationId, status: cancelledTask.status },
    };
  }

  private async validateRevaccinationAssignment(dto: CreateVaccinationDto | UpdateVaccinationDto) {
    const assigneeId = emptyToNull(dto.revaccinationAssigneeId);
    const assigneeRoleCode = emptyToNull(dto.revaccinationAssigneeRoleCode);

    if (assigneeId && assigneeRoleCode) {
      throw new BadRequestException('Выберите сотрудника или роль для задачи ревакцинации, не оба варианта одновременно');
    }

    if (assigneeId) {
      await this.schedulingService.ensureEmployeeActive(assigneeId);
    }
  }

  private async resolveRevaccinationAssignment(
    tx: Prisma.TransactionClient,
    dto: CreateVaccinationDto | UpdateVaccinationDto,
    existingTask: VaccinationTask | null,
  ) {
    const assigneeId = emptyToNull(dto.revaccinationAssigneeId);
    const assigneeRoleCode = emptyToNull(dto.revaccinationAssigneeRoleCode);
    const hasAssignmentPatch = dto.revaccinationAssigneeId !== undefined || dto.revaccinationAssigneeRoleCode !== undefined;

    if (assigneeRoleCode) {
      await this.ensureRoleExists(tx, assigneeRoleCode);
    }

    if (hasAssignmentPatch) {
      return {
        shouldPatch: true,
        assigneeId: assigneeId ?? null,
        assigneeRoleCode: assigneeRoleCode ?? null,
      };
    }

    if (existingTask) {
      return { shouldPatch: false, assigneeId: undefined, assigneeRoleCode: undefined };
    }

    const defaultRole = await tx.role.findUnique({
      where: { code: 'doctor' },
      select: { code: true },
    });

    return {
      shouldPatch: true,
      assigneeId: null,
      assigneeRoleCode: defaultRole?.code ?? null,
    };
  }

  private async ensureRoleExists(tx: Prisma.TransactionClient, roleCode: string) {
    const role = await tx.role.findUnique({
      where: { code: roleCode },
      select: { code: true },
    });

    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }
  }

  private buildRevaccinationComment(animal: AnimalForVaccination, vaccination: VaccinationWithTask) {
    const details = [animal.nickname, animal.species, animal.breed].filter(Boolean).join(', ');
    const notes = vaccination.notes ? `\nКомментарий: ${vaccination.notes}` : '';

    return `Автоматическая задача по ревакцинации. Пациент: ${details || animal.nickname}.${notes}`;
  }

  private async logTaskAudit(taskAudit: TaskAudit | null, actorId: string) {
    if (!taskAudit) {
      return;
    }

    await this.auditService.log({
      actorId,
      action: taskAudit.action,
      entityType: 'Task',
      entityId: taskAudit.taskId,
      metadata: taskAudit.metadata,
    });
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

const vaccinationInclude = {
  revaccinationTask: {
    select: {
      id: true,
      status: true,
      dueAt: true,
      assigneeId: true,
      assigneeRoleCode: true,
      title: true,
    },
  },
} satisfies Prisma.VaccinationInclude;

type VaccinationWithTask = Prisma.VaccinationGetPayload<{ include: typeof vaccinationInclude }>;
type VaccinationTask = VaccinationWithTask['revaccinationTask'];
type AnimalForVaccination = Awaited<ReturnType<AnimalsService['getAnimalForVaccination']>>;

type TaskAudit = {
  action: 'task.create' | 'task.update' | 'task.cancel';
  taskId: string;
  metadata: Prisma.InputJsonObject;
};

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function dateOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Укажите корректную дату');
  }

  return date;
}
