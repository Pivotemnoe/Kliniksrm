import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClinicOfficeDto } from './dto/create-clinic-office.dto';
import { CreateEmployeeShiftDto } from './dto/create-employee-shift.dto';
import { CreateEmployeeShiftsBulkDto } from './dto/create-employee-shifts-bulk.dto';
import { CreateSchedulingResourceDto } from './dto/create-scheduling-resource.dto';
import { ListEmployeeShiftsQueryDto } from './dto/list-employee-shifts-query.dto';
import { UpdateClinicOfficeDto } from './dto/update-clinic-office.dto';
import { UpdateEmployeeShiftDto } from './dto/update-employee-shift.dto';
import { UpdateSchedulingResourceDto } from './dto/update-scheduling-resource.dto';

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getResources() {
    const [offices, rooms, employees] = await this.prisma.$transaction([
      this.prisma.clinicOffice.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          timezone: true,
          address: true,
        },
      }),
      this.prisma.room.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          officeId: true,
          name: true,
        },
      }),
      this.prisma.employee.findMany({
        where: { status: EmployeeStatus.ACTIVE },
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          fullName: true,
          position: true,
          phone: true,
          restrictLoginToShifts: true,
        },
      }),
    ]);

    return { offices, rooms, employees };
  }

  async getSettingsResources() {
    const offices = await this.prisma.clinicOffice.findMany({
      orderBy: { name: 'asc' },
      include: {
        rooms: { orderBy: { name: 'asc' } },
        hospitalBoxes: { orderBy: { name: 'asc' } },
        warehouses: { orderBy: { name: 'asc' } },
      },
    });

    return { offices };
  }

  async createOffice(dto: CreateClinicOfficeDto, actorId: string) {
    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!organization) {
      throw new BadRequestException('Организация не настроена');
    }

    const office = await this.prisma.clinicOffice.create({
      data: {
        organizationId: organization.id,
        name: requiredName(dto.name, 'Укажите название филиала'),
        phone: emptyToNull(dto.phone),
        timezone: requiredName(dto.timezone ?? 'Europe/Moscow', 'Укажите часовой пояс'),
        address: emptyToNull(dto.address),
        ...(dto.workingHours !== undefined ? { workingHours: dto.workingHours as Prisma.InputJsonValue } : {}),
      },
      include: {
        rooms: { orderBy: { name: 'asc' } },
        hospitalBoxes: { orderBy: { name: 'asc' } },
        warehouses: { orderBy: { name: 'asc' } },
      },
    });

    await this.auditService.log({
      actorId,
      action: 'scheduling.office.create',
      entityType: 'ClinicOffice',
      entityId: office.id,
      metadata: { name: office.name },
    });

    return office;
  }

  async updateOffice(officeId: string, dto: UpdateClinicOfficeDto, actorId: string) {
    await this.ensureOfficeExists(officeId);

    try {
      const office = await this.prisma.clinicOffice.update({
        where: { id: officeId },
        data: {
          ...(dto.name !== undefined ? { name: requiredName(dto.name, 'Укажите название филиала') } : {}),
          ...(dto.phone !== undefined ? { phone: emptyToNull(dto.phone) } : {}),
          ...(dto.timezone !== undefined ? { timezone: requiredName(dto.timezone, 'Укажите часовой пояс') } : {}),
          ...(dto.address !== undefined ? { address: emptyToNull(dto.address) } : {}),
          ...(dto.workingHours !== undefined ? { workingHours: dto.workingHours as Prisma.InputJsonValue } : {}),
        },
        include: {
          rooms: { orderBy: { name: 'asc' } },
          hospitalBoxes: { orderBy: { name: 'asc' } },
          warehouses: { orderBy: { name: 'asc' } },
        },
      });

      await this.auditService.log({
        actorId,
        action: 'scheduling.office.update',
        entityType: 'ClinicOffice',
        entityId: office.id,
        metadata: { changedFields: Object.keys(dto) },
      });

      return office;
    } catch (error) {
      handleUniqueError(error, 'Филиал с таким названием уже есть');
    }
  }

  async listEmployeeShifts(query: ListEmployeeShiftsQueryDto) {
    const from = query.from ? parseDate(query.from, 'Укажите корректное начало периода') : startOfToday();
    const to = query.to ? parseDate(query.to, 'Укажите корректное окончание периода') : addDays(from, 14);

    if (from >= to) {
      throw new BadRequestException('Окончание периода должно быть позже начала');
    }

    return this.prisma.employeeShift.findMany({
      where: {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      orderBy: [{ startsAt: 'asc' }, { employee: { fullName: 'asc' } }],
      include: employeeShiftInclude,
    });
  }

  async createEmployeeShift(dto: CreateEmployeeShiftDto, actorId: string) {
    await this.ensureEmployeeActive(dto.employeeId);
    const startsAt = parseDate(dto.startsAt, 'Укажите корректное начало смены');
    const endsAt = parseDate(dto.endsAt, 'Укажите корректное окончание смены');
    validateShiftRange(startsAt, endsAt);
    await this.ensureNoShiftOverlap(dto.employeeId, startsAt, endsAt);

    const shift = await this.prisma.employeeShift.create({
      data: {
        employeeId: dto.employeeId,
        startsAt,
        endsAt,
        comment: emptyToNull(dto.comment),
        isActive: dto.isActive ?? true,
      },
      include: employeeShiftInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'scheduling.employee_shift.create',
      entityType: 'EmployeeShift',
      entityId: shift.id,
      metadata: { employeeId: shift.employeeId, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() },
    });

    return shift;
  }

  async createEmployeeShiftsBulk(dto: CreateEmployeeShiftsBulkDto, actorId: string) {
    const drafts = await this.prepareEmployeeShiftDrafts(dto.shifts);
    ensureNoDraftShiftOverlap(drafts);

    for (const draft of drafts.filter((item) => item.isActive)) {
      await this.ensureNoShiftOverlap(draft.employeeId, draft.startsAt, draft.endsAt);
    }

    const shifts = await this.prisma.$transaction(
      drafts.map((draft) =>
        this.prisma.employeeShift.create({
          data: {
            employeeId: draft.employeeId,
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
            comment: draft.comment,
            isActive: draft.isActive,
          },
          include: employeeShiftInclude,
        }),
      ),
    );

    await this.auditService.log({
      actorId,
      action: 'scheduling.employee_shift.bulk_create',
      entityType: 'EmployeeShift',
      entityId: shifts[0]?.id ?? null,
      metadata: { count: shifts.length, employeeIds: [...new Set(shifts.map((shift) => shift.employeeId))] },
    });

    return shifts;
  }

  async updateEmployeeShift(shiftId: string, dto: UpdateEmployeeShiftDto, actorId: string) {
    const existing = await this.getEmployeeShiftOrThrow(shiftId);
    const employeeId = dto.employeeId ?? existing.employeeId;
    if (dto.employeeId) {
      await this.ensureEmployeeActive(dto.employeeId);
    }

    const startsAt = dto.startsAt ? parseDate(dto.startsAt, 'Укажите корректное начало смены') : existing.startsAt;
    const endsAt = dto.endsAt ? parseDate(dto.endsAt, 'Укажите корректное окончание смены') : existing.endsAt;
    const nextIsActive = dto.isActive ?? existing.isActive;
    validateShiftRange(startsAt, endsAt);
    if (nextIsActive) {
      await this.ensureNoShiftOverlap(employeeId, startsAt, endsAt, shiftId);
    }

    const shift = await this.prisma.employeeShift.update({
      where: { id: shiftId },
      data: {
        ...(dto.employeeId !== undefined ? { employeeId } : {}),
        ...(dto.startsAt !== undefined ? { startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt } : {}),
        ...(dto.comment !== undefined ? { comment: emptyToNull(dto.comment) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: employeeShiftInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'scheduling.employee_shift.update',
      entityType: 'EmployeeShift',
      entityId: shift.id,
      metadata: { changedFields: Object.keys(dto), employeeId: shift.employeeId },
    });

    return shift;
  }

  async disableEmployeeShift(shiftId: string, actorId: string) {
    await this.getEmployeeShiftOrThrow(shiftId);
    const shift = await this.prisma.employeeShift.update({
      where: { id: shiftId },
      data: { isActive: false },
      include: employeeShiftInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'scheduling.employee_shift.disable',
      entityType: 'EmployeeShift',
      entityId: shift.id,
      metadata: { employeeId: shift.employeeId },
    });

    return shift;
  }

  async deleteEmployeeShift(shiftId: string, actorId: string) {
    const existing = await this.getEmployeeShiftOrThrow(shiftId);

    await this.prisma.employeeShift.delete({ where: { id: shiftId } });

    await this.auditService.log({
      actorId,
      action: 'scheduling.employee_shift.delete',
      entityType: 'EmployeeShift',
      entityId: shiftId,
      metadata: {
        employeeId: existing.employeeId,
        startsAt: existing.startsAt.toISOString(),
        endsAt: existing.endsAt.toISOString(),
      },
    });

    return { deleted: true, id: shiftId };
  }

  async createRoom(dto: CreateSchedulingResourceDto, actorId: string) {
    const officeId = await this.resolveOfficeId(dto.officeId);

    try {
      const room = await this.prisma.room.create({
        data: { officeId, name: requiredName(dto.name, 'Укажите название кабинета') },
        include: { office: { select: { id: true, name: true } } },
      });

      await this.auditService.log({
        actorId,
        action: 'scheduling.room.create',
        entityType: 'Room',
        entityId: room.id,
        metadata: { officeId, name: room.name },
      });

      return room;
    } catch (error) {
      handleUniqueError(error, 'Кабинет с таким названием уже есть в филиале');
    }
  }

  async updateRoom(roomId: string, dto: UpdateSchedulingResourceDto, actorId: string) {
    await this.ensureRoomExists(roomId);
    const officeId = dto.officeId ? await this.resolveOfficeId(dto.officeId) : undefined;

    try {
      const room = await this.prisma.room.update({
        where: { id: roomId },
        data: {
          ...(officeId !== undefined ? { officeId } : {}),
          ...(dto.name !== undefined ? { name: requiredName(dto.name, 'Укажите название кабинета') } : {}),
        },
        include: { office: { select: { id: true, name: true } } },
      });

      await this.auditService.log({
        actorId,
        action: 'scheduling.room.update',
        entityType: 'Room',
        entityId: room.id,
        metadata: { changedFields: Object.keys(dto), officeId: room.officeId },
      });

      return room;
    } catch (error) {
      handleUniqueError(error, 'Кабинет с таким названием уже есть в филиале');
    }
  }

  async createHospitalBox(dto: CreateSchedulingResourceDto, actorId: string) {
    const officeId = await this.resolveOfficeId(dto.officeId);

    try {
      const box = await this.prisma.hospitalBox.create({
        data: { officeId, name: requiredName(dto.name, 'Укажите название бокса') },
        include: { office: { select: { id: true, name: true } } },
      });

      await this.auditService.log({
        actorId,
        action: 'scheduling.hospital_box.create',
        entityType: 'HospitalBox',
        entityId: box.id,
        metadata: { officeId, name: box.name },
      });

      return box;
    } catch (error) {
      handleUniqueError(error, 'Бокс с таким названием уже есть в филиале');
    }
  }

  async updateHospitalBox(hospitalBoxId: string, dto: UpdateSchedulingResourceDto, actorId: string) {
    await this.ensureHospitalBoxExists(hospitalBoxId);
    const officeId = dto.officeId ? await this.resolveOfficeId(dto.officeId) : undefined;

    try {
      const box = await this.prisma.hospitalBox.update({
        where: { id: hospitalBoxId },
        data: {
          ...(officeId !== undefined ? { officeId } : {}),
          ...(dto.name !== undefined ? { name: requiredName(dto.name, 'Укажите название бокса') } : {}),
        },
        include: { office: { select: { id: true, name: true } } },
      });

      await this.auditService.log({
        actorId,
        action: 'scheduling.hospital_box.update',
        entityType: 'HospitalBox',
        entityId: box.id,
        metadata: { changedFields: Object.keys(dto), officeId: box.officeId },
      });

      return box;
    } catch (error) {
      handleUniqueError(error, 'Бокс с таким названием уже есть в филиале');
    }
  }

  async createWarehouse(dto: CreateSchedulingResourceDto, actorId: string) {
    const officeId = await this.resolveOfficeId(dto.officeId);

    try {
      const warehouse = await this.prisma.warehouse.create({
        data: { officeId, name: requiredName(dto.name, 'Укажите название склада') },
        include: { office: { select: { id: true, name: true } } },
      });

      await this.auditService.log({
        actorId,
        action: 'scheduling.warehouse.create',
        entityType: 'Warehouse',
        entityId: warehouse.id,
        metadata: { officeId, name: warehouse.name },
      });

      return warehouse;
    } catch (error) {
      handleUniqueError(error, 'Склад с таким названием уже есть в филиале');
    }
  }

  async updateWarehouse(warehouseId: string, dto: UpdateSchedulingResourceDto, actorId: string) {
    await this.ensureWarehouseExists(warehouseId);
    const officeId = dto.officeId ? await this.resolveOfficeId(dto.officeId) : undefined;

    try {
      const warehouse = await this.prisma.warehouse.update({
        where: { id: warehouseId },
        data: {
          ...(officeId !== undefined ? { officeId } : {}),
          ...(dto.name !== undefined ? { name: requiredName(dto.name, 'Укажите название склада') } : {}),
        },
        include: { office: { select: { id: true, name: true } } },
      });

      await this.auditService.log({
        actorId,
        action: 'scheduling.warehouse.update',
        entityType: 'Warehouse',
        entityId: warehouse.id,
        metadata: { changedFields: Object.keys(dto), officeId: warehouse.officeId },
      });

      return warehouse;
    } catch (error) {
      handleUniqueError(error, 'Склад с таким названием уже есть в филиале');
    }
  }

  async getDefaultOfficeId() {
    const office = await this.prisma.clinicOffice.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!office) {
      throw new BadRequestException('Clinic office is not configured');
    }

    return office.id;
  }

  async ensureOfficeExists(officeId: string) {
    const office = await this.prisma.clinicOffice.findUnique({
      where: { id: officeId },
      select: { id: true },
    });

    if (!office) {
      throw new NotFoundException('Clinic office not found');
    }
  }

  private async resolveOfficeId(officeId?: string) {
    if (officeId) {
      await this.ensureOfficeExists(officeId);
      return officeId;
    }

    return this.getDefaultOfficeId();
  }

  async ensureOwnerExists(ownerId: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });

    if (!owner) {
      throw new NotFoundException('Owner not found');
    }
  }

  async resolveAnimalOwner(animalId: string, ownerId?: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      select: { id: true, ownerId: true },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }

    if (ownerId && animal.ownerId !== ownerId) {
      throw new BadRequestException('Animal does not belong to owner');
    }

    return animal.ownerId;
  }

  async ensureEmployeeActive(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, status: true },
    });

    if (!employee || employee.status !== EmployeeStatus.ACTIVE) {
      throw new NotFoundException('Active employee not found');
    }
  }

  async ensureRoomExists(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, officeId: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async ensureHospitalBoxExists(hospitalBoxId: string) {
    const hospitalBox = await this.prisma.hospitalBox.findUnique({
      where: { id: hospitalBoxId },
      select: { id: true, officeId: true },
    });

    if (!hospitalBox) {
      throw new NotFoundException('Hospital box not found');
    }

    return hospitalBox;
  }

  async ensureWarehouseExists(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, officeId: true },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  private async prepareEmployeeShiftDrafts(items: CreateEmployeeShiftDto[]) {
    const employeeIds = [...new Set(items.map((item) => item.employeeId))];

    for (const employeeId of employeeIds) {
      await this.ensureEmployeeActive(employeeId);
    }

    return items.map((item) => {
      const startsAt = parseDate(item.startsAt, 'Укажите корректное начало смены');
      const endsAt = parseDate(item.endsAt, 'Укажите корректное окончание смены');
      validateShiftRange(startsAt, endsAt);

      return {
        employeeId: item.employeeId,
        startsAt,
        endsAt,
        comment: emptyToNull(item.comment),
        isActive: item.isActive ?? true,
      };
    });
  }

  private async getEmployeeShiftOrThrow(shiftId: string) {
    const shift = await this.prisma.employeeShift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      throw new NotFoundException('Смена сотрудника не найдена');
    }

    return shift;
  }

  private async ensureNoShiftOverlap(employeeId: string, startsAt: Date, endsAt: Date, ignoreShiftId?: string) {
    const overlap = await this.prisma.employeeShift.findFirst({
      where: {
        employeeId,
        isActive: true,
        ...(ignoreShiftId ? { id: { not: ignoreShiftId } } : {}),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    if (overlap) {
      throw new BadRequestException(
        `У сотрудника уже есть активная смена в это время: ${overlap.startsAt.toLocaleString('ru-RU')} - ${overlap.endsAt.toLocaleString('ru-RU')}`,
      );
    }
  }
}

const employeeShiftInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      position: true,
      phone: true,
      restrictLoginToShifts: true,
    },
  },
} satisfies Prisma.EmployeeShiftInclude;

function requiredName(value: string, message: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new BadRequestException(message);
  }

  return normalized;
}

function emptyToNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseDate(value: string, message: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(message);
  }

  return date;
}

function validateShiftRange(startsAt: Date, endsAt: Date) {
  if (startsAt >= endsAt) {
    throw new BadRequestException('Окончание смены должно быть позже начала');
  }
}

function ensureNoDraftShiftOverlap(
  drafts: Array<{ employeeId: string; startsAt: Date; endsAt: Date; isActive: boolean }>,
) {
  const activeDrafts = drafts
    .filter((draft) => draft.isActive)
    .sort(
      (first, second) =>
        first.employeeId.localeCompare(second.employeeId) || first.startsAt.getTime() - second.startsAt.getTime(),
    );

  for (let index = 1; index < activeDrafts.length; index += 1) {
    const previous = activeDrafts[index - 1];
    const current = activeDrafts[index];

    if (previous.employeeId === current.employeeId && previous.endsAt > current.startsAt) {
      throw new BadRequestException(
        `В копируемых сменах есть пересечение: ${previous.startsAt.toLocaleString('ru-RU')} - ${previous.endsAt.toLocaleString('ru-RU')}`,
      );
    }
  }
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function handleUniqueError(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new BadRequestException(message);
  }

  throw error;
}
