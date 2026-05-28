import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async listEmployees() {
    const employees = await this.prisma.employee.findMany({
      orderBy: { fullName: 'asc' },
      include: employeeInclude,
    });

    return employees.map(serializeEmployee);
  }

  async getEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: employeeInclude,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return serializeEmployee(employee);
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permission: { code: 'asc' } },
        },
      },
    });

    return roles.map((role) => ({
      code: role.code,
      title: role.title,
      description: role.description,
      permissions: role.permissions.map(({ permission }) => ({
        code: permission.code,
        title: permission.title,
      })),
    }));
  }

  async createEmployee(dto: CreateEmployeeDto, actorId: string) {
    if (!dto.phone && !dto.email) {
      throw new BadRequestException('Employee must have phone or email for login');
    }

    const roles = await this.findRolesOrThrow(dto.roleCodes);
    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const email = dto.email?.toLowerCase();

    try {
      const employee = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            phone: dto.phone,
            passwordHash,
          },
        });

        return tx.employee.create({
          data: {
            userId: user.id,
            fullName: dto.fullName,
            phone: dto.phone,
            position: dto.position,
            status: EmployeeStatus.ACTIVE,
            roles: {
              create: roles.map((role) => ({
                roleId: role.id,
              })),
            },
          },
          include: employeeInclude,
        });
      });

      await this.auditService.log({
        actorId,
        action: 'employee.create',
        entityType: 'Employee',
        entityId: employee.id,
        metadata: { roleCodes: dto.roleCodes },
      });

      return serializeEmployee(employee);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Employee login phone or email already exists');
      }

      throw error;
    }
  }

  async updateEmployee(employeeId: string, dto: UpdateEmployeeDto, actorId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });

    if (!employee || !employee.userId || !employee.user) {
      throw new NotFoundException('Employee not found');
    }

    if (employeeId === actorId && dto.status === EmployeeStatus.BLOCKED) {
      throw new BadRequestException('Director cannot block own active employee session');
    }

    const userId = employee.userId;
    const roles = dto.roleCodes ? await this.findRolesOrThrow(dto.roleCodes) : null;
    const passwordHash = dto.password ? await this.passwordService.hashPassword(dto.password) : undefined;

    try {
      const updatedEmployee = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(dto.email !== undefined ? { email: dto.email?.toLowerCase() ?? null } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone ?? null } : {}),
            ...(passwordHash ? { passwordHash } : {}),
          },
        });

        if (roles) {
          await tx.employeeRole.deleteMany({ where: { employeeId } });
          await tx.employeeRole.createMany({
            data: roles.map((role) => ({
              employeeId,
              roleId: role.id,
            })),
          });
        }

        return tx.employee.update({
          where: { id: employeeId },
          data: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone ?? null } : {}),
            ...(dto.position !== undefined ? { position: dto.position ?? null } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
          },
          include: employeeInclude,
        });
      });

      await this.auditService.log({
        actorId,
        action: 'employee.update',
        entityType: 'Employee',
        entityId: employeeId,
        metadata: {
          changedFields: Object.keys(dto).filter((key) => key !== 'password'),
          passwordChanged: Boolean(dto.password),
          roleCodes: dto.roleCodes,
        },
      });

      return serializeEmployee(updatedEmployee);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Employee login phone or email already exists');
      }

      throw error;
    }
  }

  private async findRolesOrThrow(roleCodes: string[]) {
    const uniqueCodes = [...new Set(roleCodes)];
    const roles = await this.prisma.role.findMany({
      where: { code: { in: uniqueCodes } },
    });

    if (roles.length !== uniqueCodes.length) {
      const foundCodes = new Set(roles.map((role) => role.code));
      const missingCodes = uniqueCodes.filter((code) => !foundCodes.has(code));
      throw new BadRequestException(`Unknown role codes: ${missingCodes.join(', ')}`);
    }

    return roles;
  }
}

const employeeInclude = {
  user: {
    select: {
      id: true,
      email: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
} satisfies Prisma.EmployeeInclude;

function serializeEmployee(employee: Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>) {
  return {
    id: employee.id,
    fullName: employee.fullName,
    phone: employee.phone,
    position: employee.position,
    status: employee.status,
    user: employee.user,
    roles: employee.roles.map(({ role }) => ({
      code: role.code,
      title: role.title,
      permissions: role.permissions.map(({ permission }) => permission.code).sort(),
    })),
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
