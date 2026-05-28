import { Injectable, UnauthorizedException } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);

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

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: login }, ...(normalizedEmail ? [{ email: normalizedEmail }] : [])],
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

      throw new UnauthorizedException('Invalid login or password');
    }

    if (!user.employee || user.employee.status !== EmployeeStatus.ACTIVE) {
      await this.auditService.log({
        actorId: user.employee?.id,
        action: 'auth.login_blocked',
        entityType: 'Employee',
        entityId: user.employee?.id,
        ipAddress,
      });

      throw new UnauthorizedException('Employee is blocked or not linked to this user');
    }

    const token = randomBytes(48).toString('base64url');
    const sessionId = this.hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

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
      employee: this.serializeEmployee(user.employee),
    };
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

  hashSessionToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  serializeEmployee(employee: {
    id: string;
    userId: string | null;
    fullName: string;
    phone: string | null;
    position: string | null;
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
  }) {
    const permissions = new Set<string>();
    const roles = employee.roles.map(({ role }) => {
      for (const { permission } of role.permissions) {
        permissions.add(permission.code);
      }

      return role.code;
    });

    return {
      id: employee.id,
      userId: employee.userId ?? '',
      fullName: employee.fullName,
      phone: employee.phone,
      position: employee.position,
      status: employee.status,
      roles,
      permissions: [...permissions].sort(),
    };
  }
}

