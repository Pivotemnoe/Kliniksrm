import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';
export const REQUIRED_ANY_PERMISSIONS_KEY = 'requiredAnyPermissions';
export const REQUIRED_ROLES_KEY = 'requiredRoles';

export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
export const RequireAnyPermissions = (...permissions: string[]) => SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions);
export const RequireRoles = (...roles: string[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
