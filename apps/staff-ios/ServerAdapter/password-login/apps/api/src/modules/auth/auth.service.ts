import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { formatNormalizedRussianPhone, normalizePhoneForLookup } from '../../common/phone';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);
const SESSION_IDLE_TIMEOUT_MINUTES = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? 15);

import { staffAppSettings } from '../staff-app/staff-app.policy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async login(
    dto: LoginDto,
    ipAddress?: string | null,
    userAgent?: string | null,
    access: { accessType: 'LOCAL' | 'REMOTE'; remoteDeviceToken?: string | null; staffInstallationId?: string; staffDeviceName?: string } = { accessType: 'LOCAL' },
  ) {
    const login = dto.login.trim();
    const normalizedEmail = login.includes('@') ? login.toLowerCase() : undefined;
    const normalizedPhone = normalizeLoginPhoneForLookup(login);
    const phoneCandidates = new Set<string>([login]);

    if (normalizedPhone) {
      phoneCandidates.add(formatNormalizedRussianPhone(normalizedPhone)!);
      phoneCandidates.add(`+${normalizedPhone}`);
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...[...phoneCandidates].map((phone) => ({ phone })),
          ...(normalizedPhone ? [{ phoneNormalized: normalizedPhone }] : []),
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
      },
      include: {
        employee: {
          include: {
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
          },
        },
      },
    });

    if (!user || !(await this.passwordService.verifyPassword(dto.password, user.passwordHash))) {
      await this.auditService.log({
        action: 'auth.login_failed',
        entityType: 'Auth',
        metadata: { login },
        ipAddress,
      });

      throw new UnauthorizedException('Неверный логин или пароль');
    }

    if (!user.employee || user.employee.status !== EmployeeStatus.ACTIVE) {
      await this.auditService.log({
        actorId: user.employee?.id,
        action: 'auth.login_blocked',
        entityType: 'Employee',
        entityId: user.employee?.id,
        ipAddress,
      });

      throw new UnauthorizedException('Сотрудник заблокирован или не связан с пользователем');
    }

    if (access.staffInstallationId && !staffAppSettings(user.employee.permissionOverrides).enabled) {
      throw new ForbiddenException('Вход в приложение отключён для этой учётной записи в CRM');
    }

    let remoteDeviceId: string | null = null;
    let staffDeviceToken: string | null = null;
    let idleTimeoutMinutes = SESSION_IDLE_TIMEOUT_MINUTES;
    if (access.accessType === 'REMOTE') {
      const policy = await this.prisma.remoteAccessPolicy.findFirst();
      if (!policy?.enabled) {
        await this.auditService.log({
          actorId: user.employee.id,
          action: 'auth.remote_login_blocked',
          entityType: 'RemoteAccessPolicy',
          metadata: { reason: 'disabled' },
          ipAddress,
        });
        throw new UnauthorizedException('Удалённый доступ клиники отключён');
      }

      if (access.staffInstallationId) {
        // Password and active employee are checked above; the legacy web login still requires its invitation.
        const old = access.remoteDeviceToken
          ? await this.prisma.remoteAccessDevice.findUnique({ where: { tokenHash: this.hashSessionToken(access.remoteDeviceToken) } })
          : null;
        if (old?.employeeId === user.employee.id && old.revokedAt) {
          throw new UnauthorizedException('Доступ с этого телефона отозван в CRM');
        }
        if (old?.employeeId === user.employee.id && !old.revokedAt) {
          staffDeviceToken = access.remoteDeviceToken!;
        } else {
          const secret = process.env.REMOTE_ACCESS_GATEWAY_SECRET?.trim();
          if (!secret) throw new UnauthorizedException('Соединение с клиникой ещё не настроено');
          await this.assertEmployeeCanUseCrm(user.employee, 'auth.staff_login_outside_shift', ipAddress, 'REMOTE',
            !this.serializeEmployee(user.employee, user.mustChangePassword).roles.includes('director'));
          staffDeviceToken = createHmac('sha256', secret)
            .update(`staff-app:v1:${policy.organizationId}:${user.employee.id}:${access.staffInstallationId}`)
            .digest('base64url');
          const registered = await this.prisma.remoteAccessDevice.upsert({
            where: { tokenHash: this.hashSessionToken(staffDeviceToken) },
            create: { organizationId: policy.organizationId, employeeId: user.employee.id,
              tokenHash: this.hashSessionToken(staffDeviceToken), name: access.staffDeviceName?.trim() || 'Телефон сотрудника',
              userAgent: userAgent ?? null, lastIpAddress: ipAddress ?? null, lastSeenAt: new Date() },
            update: {},
          });
          if (registered.revokedAt || registered.employeeId !== user.employee.id) {
            throw new UnauthorizedException('Доступ с этого телефона отозван в CRM');
          }
          await this.auditService.log({ actorId: user.employee.id, action: 'auth.staff_device_password_login',
            entityType: 'RemoteAccessDevice', entityId: registered.id, ipAddress });
        }
      }

      const effectiveDeviceToken = staffDeviceToken ?? access.remoteDeviceToken;
      const tokenHash = effectiveDeviceToken ? this.hashSessionToken(effectiveDeviceToken) : null;
      const device = tokenHash
        ? await this.prisma.remoteAccessDevice.findUnique({ where: { tokenHash } })
        : null;
      if (!device || device.revokedAt || device.employeeId !== user.employee.id) {
        await this.auditService.log({
          actorId: user.employee.id,
          action: 'auth.remote_login_blocked',
          entityType: 'RemoteAccessDevice',
          metadata: { reason: 'device_not_trusted' },
          ipAddress,
        });
        throw new UnauthorizedException({
          code: 'REMOTE_DEVICE_NOT_TRUSTED',
          message: 'Это устройство не привязано к учётной записи сотрудника',
        });
      }

      remoteDeviceId = device.id;
      idleTimeoutMinutes = policy.idleTimeoutMinutes;
      await this.prisma.remoteAccessDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(), lastIpAddress: ipAddress ?? null, userAgent: userAgent ?? device.userAgent },
      });
    }

    // Only a validated remote device may bypass shifts, and only in read-only mode.
    const trustedRemoteReadOnly = Boolean(remoteDeviceId)
      && !this.serializeEmployee(user.employee, user.mustChangePassword).roles.includes('director');
    await this.assertEmployeeCanUseCrm(user.employee, 'auth.login_outside_shift', ipAddress, access.accessType, trustedRemoteReadOnly);

    const token = randomBytes(48).toString('base64url');
    const sessionId = this.hashSessionToken(token);
    const expiresAt = this.getIdleSessionExpiresAt(idleTimeoutMinutes);
    const cookieExpiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        accessType: access.accessType,
        remoteDeviceId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    await this.auditService.log({
      actorId: user.employee.id,
      action: 'auth.login',
      entityType: 'Session',
      entityId: sessionId,
      ipAddress,
      metadata: { accessType: access.accessType, remoteDeviceId },
    });

    return {
      token,
      expiresAt,
      cookieExpiresAt,
      employee: this.serializeEmployee(user.employee, user.mustChangePassword),
      staffDeviceToken,
    };
  }

  async touchSession(sessionId: string, idleTimeoutMinutes = SESSION_IDLE_TIMEOUT_MINUTES) {
    await this.prisma.session.updateMany({
      where: { id: sessionId },
      data: { expiresAt: this.getIdleSessionExpiresAt(idleTimeoutMinutes) },
    });
  }

  async logout(sessionId: string, actorId: string, ipAddress?: string | null) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });

    await this.auditService.log({
      actorId,
      action: 'auth.logout',
      entityType: 'Session',
      entityId: sessionId,
      ipAddress,
    });
  }

  async assertEmployeeCanUseCrm(
    employee: { id: string; restrictLoginToShifts?: boolean | null; allowRemoteOutsideShift?: boolean | null },
    action: string,
    ipAddress?: string | null,
    accessType: 'LOCAL' | 'REMOTE' = 'LOCAL',
    trustedRemoteReadOnly = false,
  ) {
    if (!employee.restrictLoginToShifts || (accessType === 'REMOTE' && (employee.allowRemoteOutsideShift || trustedRemoteReadOnly))) {
      return;
    }

    const now = new Date();
    const activeShift = await this.prisma.employeeShift.findFirst({
      where: {
        employeeId: employee.id,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    if (activeShift) {
      return;
    }

    await this.auditService.log({
      actorId: employee.id,
      action,
      entityType: 'Employee',
      entityId: employee.id,
      ipAddress,
      metadata: { reason: 'no_active_shift', accessType },
    });

    throw new UnauthorizedException('Сейчас у сотрудника нет активной смены. Вход разрешён только в назначенное рабочее время.');
  }

  async changePassword({
    userId,
    sessionId,
    actorId,
    dto,
    ipAddress,
  }: {
    userId: string;
    sessionId: string;
    actorId: string;
    dto: ChangePasswordDto;
    ipAddress?: string | null;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user || !(await this.passwordService.verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Текущий пароль указан неверно');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    }

    const passwordHash = await this.passwordService.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.session.deleteMany({
        where: {
          userId,
          id: { not: sessionId },
        },
      }),
    ]);

    await this.auditService.log({
      actorId,
      action: 'auth.password_change',
      entityType: 'User',
      entityId: userId,
      ipAddress,
    });
  }

  hashSessionToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getIdleSessionExpiresAt(idleTimeoutMinutes = SESSION_IDLE_TIMEOUT_MINUTES) {
    return new Date(Date.now() + idleTimeoutMinutes * 60 * 1000);
  }

  serializeEmployee(employee: {
    id: string;
    userId: string | null;
    fullName: string;
    phone: string | null;
    position: string | null;
    defaultRoute: string | null;
    accountScope?: string;
    restrictLoginToShifts?: boolean | null;
    allowRemoteOutsideShift?: boolean | null;
    status: string;
    roles: Array<{
      role: {
        code: string;
        permissions: Array<{
          permission: {
            code: string;
          };
        }>;
      };
    }>;
    permissionOverrides?: Array<{
      effect: string;
      permission: {
        code: string;
      };
    }>;
  }, mustChangePassword = false) {
    const permissions = new Set<string>();
    const roles = employee.roles.map(({ role }) => {
      for (const { permission } of role.permissions) {
        permissions.add(permission.code);
      }

      return role.code;
    });

    for (const override of employee.permissionOverrides ?? []) {
      if (override.effect === 'DENY') {
        permissions.delete(override.permission.code);
      } else {
        permissions.add(override.permission.code);
      }
    }

    // Module accounts cannot acquire clinical access through a shared role or override.
    if (employee.accountScope === 'GROOMING') {
      for (const code of permissions) if (!['grooming.read', 'grooming.operate'].includes(code)) permissions.delete(code);
    }

    return {
      id: employee.id,
      userId: employee.userId ?? '',
      fullName: employee.fullName,
      phone: employee.phone,
      position: employee.position,
      defaultRoute: employee.defaultRoute,
      accountScope: employee.accountScope || 'CLINIC',
      staffApp: staffAppSettings(employee.permissionOverrides),
      restrictLoginToShifts: Boolean(employee.restrictLoginToShifts),
      allowRemoteOutsideShift: Boolean(employee.allowRemoteOutsideShift),
      mustChangePassword,
      status: employee.status,
      roles: employee.accountScope === 'GROOMING' ? ['groomer'] : roles,
      permissions: [...permissions].sort(),
    };
  }
}

function normalizeLoginPhoneForLookup(value: string) {
  try {
    return normalizePhoneForLookup(value);
  } catch {
    return null;
  }
}
