import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { formatNormalizedRussianPhone, normalizePhoneForLookup } from '../../common/phone';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);
const SESSION_IDLE_TIMEOUT_MINUTES = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? 15);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string | null, userAgent?: string | null) {
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

    const token = randomBytes(48).toString('base64url');
    const sessionId = this.hashSessionToken(token);
    const expiresAt = this.getIdleSessionExpiresAt();
    const cookieExpiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
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
    });

    return {
      token,
      expiresAt,
      cookieExpiresAt,
      employee: this.serializeEmployee(user.employee),
    };
  }

  async touchSession(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId },
      data: { expiresAt: this.getIdleSessionExpiresAt() },
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
        data: { passwordHash },
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

  private getIdleSessionExpiresAt() {
    return new Date(Date.now() + SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000);
  }

  serializeEmployee(employee: {
    id: string;
    userId: string | null;
    fullName: string;
    phone: string | null;
    position: string | null;
    defaultRoute: string | null;
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
  }) {
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

    return {
      id: employee.id,
      userId: employee.userId ?? '',
      fullName: employee.fullName,
      phone: employee.phone,
      position: employee.position,
      defaultRoute: employee.defaultRoute,
      status: employee.status,
      roles,
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
