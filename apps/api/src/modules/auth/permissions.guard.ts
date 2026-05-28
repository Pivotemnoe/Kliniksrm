import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './auth.types';
import { REQUIRED_PERMISSIONS_KEY } from './decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const employeePermissions = new Set(request.auth?.employee.permissions ?? []);
    const missingPermissions = requiredPermissions.filter((permission) => !employeePermissions.has(permission));

    if (missingPermissions.length) {
      throw new ForbiddenException(`Missing permissions: ${missingPermissions.join(', ')}`);
    }

    return true;
  }
}

