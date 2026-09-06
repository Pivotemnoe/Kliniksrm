import type { ClientPortalStatus } from '@prisma/client';

export type PortalActivationStatus = 'ACTIVATED' | 'NOT_ACTIVATED' | 'BLOCKED' | 'SUSPENDED' | 'UNKNOWN';

export function resolvePortalActivation(
  access: { status: ClientPortalStatus; invitedAt: Date | null; lastLoginAt: Date | null } | null,
  gatewayAvailable: boolean,
  gatewayActivatedAt?: string | null,
): PortalActivationStatus {
  if (access?.status === 'BLOCKED') return 'BLOCKED';
  if (access?.status === 'DISABLED' && (access.invitedAt || access.lastLoginAt)) return 'SUSPENDED';
  if (access?.lastLoginAt || gatewayActivatedAt) return 'ACTIVATED';
  return gatewayAvailable ? 'NOT_ACTIVATED' : 'UNKNOWN';
}
