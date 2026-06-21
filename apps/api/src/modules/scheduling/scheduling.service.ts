import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSchedulingResourceDto } from './dto/create-scheduling-resource.dto';
import { UpdateClinicOfficeDto } from './dto/update-clinic-office.dto';
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
}

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

function handleUniqueError(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new BadRequestException(message);
  }

  throw error;
}
