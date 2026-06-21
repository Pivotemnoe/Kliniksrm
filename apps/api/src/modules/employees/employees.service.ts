import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, PermissionEffect, Prisma } from '@prisma/client';
import { formatNormalizedRussianPhone, normalizePhoneForLookup } from '../../common/phone';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const allowedDefaultRoutes = new Set([
  '/dashboard',
  '/news',
  '/schedule',
  '/queue',
  '/tasks',
  '/owners',
  '/patients',
  '/visits',
  '/bills',
  '/sales',
  '/hospital',
  '/stock',
  '/messages',
  '/online-requests',
  '/settings',
]);

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
      throw new NotFoundException('Сотрудник не найден');
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
    const phoneNormalized = dto.phone !== undefined ? normalizePhoneForLookup(dto.phone) : null;
    const phone = formatNormalizedRussianPhone(phoneNormalized);
    const email = normalizeEmail(dto.email);

    if (!phoneNormalized && !email) {
      throw new BadRequestException('У сотрудника должен быть телефон или email для входа');
    }

    await this.assertPhoneIsAvailable(phoneNormalized);

    const roles = await this.findRolesOrThrow(dto.roleCodes);
    const permissionOverrides = await this.resolvePermissionOverrides(dto.permissionGrants, dto.permissionDenials);
    const warehouseIds = await this.resolveWarehouseIds(dto.warehouseIds);
    const passwordHash = await this.passwordService.hashPassword(dto.password);

    try {
      const employee = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            phone,
            phoneNormalized,
            passwordHash,
          },
        });

        return tx.employee.create({
          data: {
            userId: user.id,
            fullName: dto.fullName,
            phone,
            position: dto.position,
            defaultRoute: normalizeDefaultRoute(dto.defaultRoute),
            status: EmployeeStatus.ACTIVE,
            roles: {
              create: roles.map((role) => ({
                roleId: role.id,
              })),
            },
            permissionOverrides: permissionOverrides.length
              ? {
                  create: permissionOverrides.map((override) => ({
                    permissionId: override.permissionId,
                    effect: override.effect,
                  })),
                }
              : undefined,
            warehouseAccesses: warehouseIds.length
              ? {
                  create: warehouseIds.map((warehouseId) => ({ warehouseId })),
                }
              : undefined,
          },
          include: employeeInclude,
        });
      });

      await this.auditService.log({
        actorId,
        action: 'employee.create',
        entityType: 'Employee',
        entityId: employee.id,
        metadata: {
          roleCodes: dto.roleCodes,
          permissionOverrides: summarizePermissionOverrides(permissionOverrides),
          warehouseIds,
        },
      });

      return serializeEmployee(employee);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Телефон или email сотрудника уже используется');
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
      throw new NotFoundException('Сотрудник не найден');
    }

    if (employeeId === actorId && dto.status === EmployeeStatus.BLOCKED) {
      throw new BadRequestException('Нельзя заблокировать собственную активную учётную запись');
    }

    const userId = employee.userId;
    const roles = dto.roleCodes ? await this.findRolesOrThrow(dto.roleCodes) : null;
    const permissionOverrides =
      dto.permissionGrants !== undefined || dto.permissionDenials !== undefined
        ? await this.resolvePermissionOverrides(dto.permissionGrants, dto.permissionDenials)
        : null;
    const warehouseIds = dto.warehouseIds !== undefined ? await this.resolveWarehouseIds(dto.warehouseIds) : null;
    const passwordHash = dto.password ? await this.passwordService.hashPassword(dto.password) : undefined;
    const phoneNormalized = dto.phone !== undefined ? normalizePhoneForLookup(dto.phone) : undefined;
    const phone = phoneNormalized !== undefined ? formatNormalizedRussianPhone(phoneNormalized) : undefined;
    const email = dto.email !== undefined ? normalizeEmail(dto.email) ?? null : undefined;

    if (dto.phone !== undefined || dto.email !== undefined) {
      const nextPhoneNormalized = phoneNormalized !== undefined ? phoneNormalized : employee.user.phoneNormalized;
      const nextEmail = email !== undefined ? email : employee.user.email;

      if (!nextPhoneNormalized && !nextEmail) {
        throw new BadRequestException('У сотрудника должен быть телефон или email для входа');
      }
    }

    await this.assertPhoneIsAvailable(phoneNormalized, userId);

    if (employeeId === actorId && (roles || permissionOverrides)) {
      const ownNextPermissions = await this.resolveNextEmployeePermissions(employeeId, roles, permissionOverrides);

      if (!ownNextPermissions.has('employees.manage') || !ownNextPermissions.has('roles.manage')) {
        throw new BadRequestException('Нельзя снять с самого себя права управления сотрудниками и ролями');
      }
    }

    try {
      const updatedEmployee = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(email !== undefined ? { email } : {}),
            ...(phoneNormalized !== undefined ? { phone, phoneNormalized } : {}),
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

        if (permissionOverrides) {
          await tx.employeePermissionOverride.deleteMany({ where: { employeeId } });
          if (permissionOverrides.length) {
            await tx.employeePermissionOverride.createMany({
              data: permissionOverrides.map((override) => ({
                employeeId,
                permissionId: override.permissionId,
                effect: override.effect,
              })),
            });
          }
        }

        if (warehouseIds) {
          await tx.employeeWarehouseAccess.deleteMany({ where: { employeeId } });
          if (warehouseIds.length) {
            await tx.employeeWarehouseAccess.createMany({
              data: warehouseIds.map((warehouseId) => ({ employeeId, warehouseId })),
            });
          }
        }

        return tx.employee.update({
          where: { id: employeeId },
          data: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
            ...(dto.phone !== undefined ? { phone } : {}),
            ...(dto.position !== undefined ? { position: dto.position ?? null } : {}),
            ...(dto.defaultRoute !== undefined ? { defaultRoute: normalizeDefaultRoute(dto.defaultRoute) } : {}),
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
          permissionOverrides: permissionOverrides ? summarizePermissionOverrides(permissionOverrides) : undefined,
          warehouseIds: warehouseIds ?? undefined,
        },
      });

      return serializeEmployee(updatedEmployee);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Телефон или email сотрудника уже используется');
      }

      throw error;
    }
  }

  private async findRolesOrThrow(roleCodes: string[]) {
    const uniqueCodes = [...new Set(roleCodes)];
    const roles = await this.prisma.role.findMany({
      where: { code: { in: uniqueCodes } },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (roles.length !== uniqueCodes.length) {
      const foundCodes = new Set(roles.map((role) => role.code));
      const missingCodes = uniqueCodes.filter((code) => !foundCodes.has(code));
      throw new BadRequestException(`Неизвестные роли: ${missingCodes.join(', ')}`);
    }

    return roles;
  }

  private async resolvePermissionOverrides(permissionGrants: string[] = [], permissionDenials: string[] = []) {
    const grants = [...new Set(permissionGrants.filter(Boolean))];
    const denials = [...new Set(permissionDenials.filter(Boolean))];
    const grantSet = new Set(grants);
    const conflicts = denials.filter((code) => grantSet.has(code));

    if (conflicts.length) {
      throw new BadRequestException(`Право нельзя одновременно разрешить и запретить: ${conflicts.join(', ')}`);
    }

    const codes = [...new Set([...grants, ...denials])];
    if (!codes.length) {
      return [];
    }

    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    if (permissions.length !== codes.length) {
      const foundCodes = new Set(permissions.map((permission) => permission.code));
      const missingCodes = codes.filter((code) => !foundCodes.has(code));
      throw new BadRequestException(`Неизвестные права: ${missingCodes.join(', ')}`);
    }

    const byCode = new Map(permissions.map((permission) => [permission.code, permission]));
    return [
      ...grants.map((code) => ({ permissionId: byCode.get(code)!.id, code, effect: PermissionEffect.GRANT })),
      ...denials.map((code) => ({ permissionId: byCode.get(code)!.id, code, effect: PermissionEffect.DENY })),
    ];
  }

  private async resolveNextEmployeePermissions(
    employeeId: string,
    nextRoles: Awaited<ReturnType<EmployeesService['findRolesOrThrow']>> | null,
    nextOverrides: Awaited<ReturnType<EmployeesService['resolvePermissionOverrides']>> | null,
  ) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: employeeInclude,
    });
    const rolePermissions = nextRoles
      ? nextRoles.flatMap((role) => role.permissions.map(({ permission }) => permission.code))
      : employee.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code));
    const overrideItems = nextOverrides
      ? nextOverrides
      : employee.permissionOverrides.map(({ permission, effect }) => ({ code: permission.code, effect }));

    return applyPermissionOverrides(rolePermissions, overrideItems);
  }

  private async resolveWarehouseIds(warehouseIds: string[] = []) {
    const uniqueIds = [...new Set(warehouseIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return [];
    }

    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (warehouses.length !== uniqueIds.length) {
      const foundIds = new Set(warehouses.map((warehouse) => warehouse.id));
      const missingIds = uniqueIds.filter((warehouseId) => !foundIds.has(warehouseId));
      throw new BadRequestException(`Неизвестные склады: ${missingIds.join(', ')}`);
    }

    return uniqueIds;
  }

  private async assertPhoneIsAvailable(phoneNormalized: string | null | undefined, currentUserId?: string) {
    if (!phoneNormalized) {
      return;
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        phoneNormalized,
        ...(currentUserId ? { id: { not: currentUserId } } : {}),
      },
      select: {
        phone: true,
        employee: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!existing) {
      return;
    }

    const owner = existing.employee?.fullName ? ` у сотрудника "${existing.employee.fullName}"` : '';
    throw new ConflictException(`Телефон ${existing.phone ?? formatNormalizedRussianPhone(phoneNormalized)} уже используется${owner}`);
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
  permissionOverrides: {
    include: { permission: true },
  },
  warehouseAccesses: {
    include: {
      warehouse: {
        select: { id: true, name: true, officeId: true },
      },
    },
    orderBy: { warehouseId: 'asc' },
  },
} satisfies Prisma.EmployeeInclude;

function serializeEmployee(employee: Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>) {
  const rolePermissions = employee.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code));
  const effectivePermissions = applyPermissionOverrides(
    rolePermissions,
    employee.permissionOverrides.map(({ permission, effect }) => ({ code: permission.code, effect })),
  );

  return {
    id: employee.id,
    fullName: employee.fullName,
    phone: employee.phone,
    position: employee.position,
    defaultRoute: employee.defaultRoute,
    status: employee.status,
    user: employee.user,
    roles: employee.roles.map(({ role }) => ({
      code: role.code,
      title: role.title,
      permissions: role.permissions.map(({ permission }) => permission.code).sort(),
    })),
    permissionOverrides: employee.permissionOverrides
      .map(({ permission, effect }) => ({
        code: permission.code,
        title: permission.title,
        effect,
      }))
      .sort((left, right) => left.code.localeCompare(right.code)),
    warehouses: employee.warehouseAccesses.map(({ warehouse }) => warehouse).sort((left, right) => left.name.localeCompare(right.name)),
    effectivePermissions: [...effectivePermissions].sort(),
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

function applyPermissionOverrides(
  rolePermissions: string[],
  overrides: Array<{ code: string; effect: PermissionEffect | 'GRANT' | 'DENY' }>,
) {
  const permissions = new Set(rolePermissions);
  for (const override of overrides) {
    if (override.effect === 'DENY') {
      permissions.delete(override.code);
    } else {
      permissions.add(override.code);
    }
  }

  return permissions;
}

function summarizePermissionOverrides(overrides: Array<{ code: string; effect: PermissionEffect }>) {
  return {
    grants: overrides.filter((override) => override.effect === PermissionEffect.GRANT).map((override) => override.code),
    denials: overrides.filter((override) => override.effect === PermissionEffect.DENY).map((override) => override.code),
  };
}

function normalizeDefaultRoute(defaultRoute: string | undefined) {
  const route = defaultRoute?.trim();
  if (!route) {
    return null;
  }

  if (!allowedDefaultRoutes.has(route)) {
    throw new BadRequestException('Неизвестный раздел по умолчанию');
  }

  return route;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function normalizeEmail(value?: string | null) {
  const email = value?.trim().toLowerCase();
  return email || undefined;
}
