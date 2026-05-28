import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { parseCookie, SESSION_COOKIE_NAME } from './session-cookie';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
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
      throw new UnauthorizedException('Authentication required');
    }

    const sessionId = this.authService.hashSessionToken(token);
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
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

      throw new UnauthorizedException('Session expired');
    }

    if (!session.user.employee || session.user.employee.status !== EmployeeStatus.ACTIVE) {
      throw new UnauthorizedException('Employee is blocked or missing');
    }

    request.auth = {
      sessionId: session.id,
      userId: session.userId,
      employee: this.authService.serializeEmployee(session.user.employee),
    };

    return true;
  }
}

