import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

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
}
