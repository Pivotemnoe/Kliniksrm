import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
  ) {}

  async listTasks(query: ListTasksQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.TaskWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.assigneeRoleCode ? { assigneeRoleCode: query.assigneeRoleCode } : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueAt: {
              ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
              ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { comment: { contains: search, mode: 'insensitive' } },
              { taskType: { contains: search, mode: 'insensitive' } },
              { owner: { fullName: { contains: search, mode: 'insensitive' } } },
              { owner: { phone: { contains: search, mode: 'insensitive' } } },
              { animal: { nickname: { contains: search, mode: 'insensitive' } } },
              { assignee: { fullName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        include: taskInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items: await this.withRoleTitles(items), total, limit, offset };
  }

  async createTask(dto: CreateTaskDto, actorId: string) {
    const data = (await this.resolveTaskData(dto)) as Prisma.TaskUncheckedCreateInput;
    const task = await this.prisma.task.create({
      data: {
        ...data,
        creatorId: actorId,
      },
      include: taskInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'task.create',
      entityType: 'Task',
      entityId: task.id,
      metadata: {
        ownerId: task.ownerId,
        animalId: task.animalId,
        assigneeId: task.assigneeId,
        assigneeRoleCode: task.assigneeRoleCode,
        status: task.status,
      },
    });

    return (await this.withRoleTitles([task]))[0];
  }

  async getTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: taskInclude,
    });

    if (!task) {
      throw new NotFoundException('Задача не найдена');
    }

    return (await this.withRoleTitles([task]))[0];
  }

  async updateTask(taskId: string, dto: UpdateTaskDto, actorId: string) {
    await this.ensureTaskExists(taskId);
    const data = (await this.resolveTaskData(dto, true)) as Prisma.TaskUncheckedUpdateInput;
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: taskInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'task.update',
      entityType: 'Task',
      entityId: task.id,
      metadata: { changedFields: Object.keys(dto), status: task.status },
    });

    return (await this.withRoleTitles([task]))[0];
  }

  async completeTask(taskId: string, actorId: string) {
    return this.setStatus(taskId, TaskStatus.DONE, actorId, 'task.done');
  }

  async cancelTask(taskId: string, actorId: string) {
    return this.setStatus(taskId, TaskStatus.CANCELLED, actorId, 'task.cancel');
  }

  async reopenTask(taskId: string, actorId: string) {
    return this.setStatus(taskId, TaskStatus.OPEN, actorId, 'task.reopen');
  }

  async archiveTask(taskId: string, actorId: string) {
    return this.setStatus(taskId, TaskStatus.ARCHIVED, actorId, 'task.archive');
  }

  private async setStatus(taskId: string, status: TaskStatus, actorId: string, action: string) {
    await this.ensureTaskExists(taskId);
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { status },
      include: taskInclude,
    });

    await this.auditService.log({
      actorId,
      action,
      entityType: 'Task',
      entityId: task.id,
      metadata: { status },
    });

    return (await this.withRoleTitles([task]))[0];
  }

  private async resolveTaskData(dto: CreateTaskDto | UpdateTaskDto, isUpdate = false): Promise<Prisma.TaskUncheckedCreateInput | Prisma.TaskUncheckedUpdateInput> {
    const hasAssigneeId = dto.assigneeId !== undefined && dto.assigneeId !== null && dto.assigneeId !== '';
    const hasAssigneeRole = dto.assigneeRoleCode !== undefined && dto.assigneeRoleCode !== null && dto.assigneeRoleCode !== '';

    if (hasAssigneeId && hasAssigneeRole) {
      throw new BadRequestException('Выберите сотрудника или роль, не оба варианта одновременно');
    }

    const ownerId = dto.ownerId === '' ? null : dto.ownerId;
    const animalId = dto.animalId === '' ? null : dto.animalId;
    let resolvedOwnerId = ownerId;

    if (animalId) {
      resolvedOwnerId = await this.schedulingService.resolveAnimalOwner(animalId, ownerId ?? undefined);
    } else if (ownerId) {
      await this.schedulingService.ensureOwnerExists(ownerId);
    }

    if (hasAssigneeId) {
      await this.schedulingService.ensureEmployeeActive(dto.assigneeId!);
    }

    if (hasAssigneeRole) {
      await this.ensureRoleExists(dto.assigneeRoleCode!);
    }

    const dueAt = dto.dueAt ? new Date(dto.dueAt) : dto.dueAt === null ? null : undefined;

    if (dueAt instanceof Date && Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException('Укажите корректный срок задачи');
    }

    return {
      ...(!isUpdate || dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.taskType !== undefined ? { taskType: emptyToNull(dto.taskType) } : {}),
      ...(dto.ownerId !== undefined || (dto.animalId !== undefined && resolvedOwnerId !== undefined) ? { ownerId: resolvedOwnerId ?? null } : {}),
      ...(dto.animalId !== undefined ? { animalId: animalId ?? null } : {}),
      ...(dto.assigneeId !== undefined ? { assigneeId: hasAssigneeId ? dto.assigneeId : null } : {}),
      ...(dto.assigneeRoleCode !== undefined ? { assigneeRoleCode: hasAssigneeRole ? dto.assigneeRoleCode : null } : {}),
      ...(dto.dueAt !== undefined ? { dueAt } : {}),
      ...(dto.comment !== undefined ? { comment: emptyToNull(dto.comment) } : {}),
      ...('status' in dto && dto.status !== undefined ? { status: dto.status } : {}),
    };
  }

  private async ensureTaskExists(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Задача не найдена');
    }
  }

  private async ensureRoleExists(roleCode: string) {
    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
      select: { code: true },
    });

    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }
  }

  private async withRoleTitles(tasks: TaskWithRelations[]) {
    const roleCodes = [...new Set(tasks.map((task) => task.assigneeRoleCode).filter(Boolean))] as string[];

    if (!roleCodes.length) {
      return tasks.map((task) => ({ ...task, assigneeRole: null }));
    }

    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes } },
      select: { code: true, title: true },
    });
    const roleByCode = new Map(roles.map((role) => [role.code, role]));

    return tasks.map((task) => ({
      ...task,
      assigneeRole: task.assigneeRoleCode ? (roleByCode.get(task.assigneeRoleCode) ?? null) : null,
    }));
  }
}

const taskInclude = {
  owner: {
    select: { id: true, fullName: true, phone: true },
  },
  animal: {
    select: { id: true, nickname: true, species: true, breed: true, sex: true },
  },
  assignee: {
    select: { id: true, fullName: true, position: true },
  },
  creator: {
    select: { id: true, fullName: true, position: true },
  },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function emptyToNull(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}
