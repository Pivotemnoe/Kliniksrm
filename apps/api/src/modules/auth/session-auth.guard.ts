import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ALLOW_REMOTE_MUTATION_KEY } from './decorators/allow-remote-mutation.decorator';
import { parseCookie, SESSION_COOKIE_NAME } from './session-cookie';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = parseCookie(request.headers.cookie, SESSION_COOKIE_NAME);

    if (!token) {
      throw new UnauthorizedException('Требуется вход в систему');
    }

    const sessionId = this.authService.hashSessionToken(token);
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        remoteDevice: {
          include: {
            organization: { include: { remoteAccessPolicy: true } },
          },
        },
        user: {
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
        },
      },
    });

    if (!session || session.expiresAt <= new Date()) {
      if (session) {
        await this.prisma.session.deleteMany({ where: { id: session.id } });
      }

      throw new UnauthorizedException('Сессия истекла');
    }

    if (!session.user.employee || session.user.employee.status !== EmployeeStatus.ACTIVE) {
      throw new UnauthorizedException('Сотрудник заблокирован или не найден');
    }

    if (
      session.accessType === 'REMOTE' &&
      (!session.remoteDevice || session.remoteDevice.revokedAt || !session.remoteDevice.organization.remoteAccessPolicy?.enabled)
    ) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException('Удалённый доступ или доверие к устройству отозвано');
    }

    try {
      await this.authService.assertEmployeeCanUseCrm(
        session.user.employee,
        'auth.session_outside_shift',
        getIpAddress(request),
        session.accessType,
      );
    } catch (error) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      throw error;
    }

    request.auth = {
      sessionId: session.id,
      userId: session.userId,
      accessType: session.accessType,
      remoteDeviceId: session.remoteDeviceId,
      employee: this.authService.serializeEmployee(session.user.employee, session.user.mustChangePassword),
    };

    const allowRemoteMutation = this.reflector.getAllAndOverride<boolean>(ALLOW_REMOTE_MUTATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? false;
    const remoteDirectorMutation = session.accessType === 'REMOTE'
      && isMutationMethod(request.method)
      && request.auth.employee.roles.includes('director');
    if (session.accessType === 'REMOTE' && isMutationMethod(request.method) && !allowRemoteMutation && !remoteDirectorMutation) {
      await this.auditService.log({
        actorId: session.user.employee.id,
        action: 'remote_access.write_blocked',
        entityType: 'RemoteAccessDevice',
        entityId: session.remoteDeviceId ?? session.id,
        metadata: {
          method: request.method?.toUpperCase() ?? 'UNKNOWN',
          path: request.originalUrl ?? request.url ?? null,
        },
        ipAddress: getIpAddress(request),
      });
      throw new ForbiddenException('Удалённый доступ работает только в режиме просмотра. Изменения можно внести только в локальной сети клиники.');
    }
    if (remoteDirectorMutation && !allowRemoteMutation) {
      await this.auditService.log({
        actorId: session.user.employee.id,
        action: 'remote_access.director_write',
        entityType: 'RemoteAccessDevice',
        entityId: session.remoteDeviceId ?? session.id,
        metadata: {
          method: request.method?.toUpperCase() ?? 'UNKNOWN',
          path: request.originalUrl ?? request.url ?? null,
        },
        ipAddress: getIpAddress(request),
      });
    }

    const idleTimeoutMinutes = session.accessType === 'REMOTE'
      ? session.remoteDevice?.organization.remoteAccessPolicy?.idleTimeoutMinutes
      : undefined;
    await this.authService.touchSession(session.id, idleTimeoutMinutes);
    if (session.remoteDeviceId) {
      await this.prisma.remoteAccessDevice.updateMany({
        where: { id: session.remoteDeviceId, revokedAt: null },
        data: { lastSeenAt: new Date(), lastIpAddress: getIpAddress(request) },
      });
    }

    return true;
  }
}

function isMutationMethod(method?: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase());
}

function getIpAddress(request: AuthenticatedRequest) {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return request.ip ?? request.socket?.remoteAddress ?? null;
}
