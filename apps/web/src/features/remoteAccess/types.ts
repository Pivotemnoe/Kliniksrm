export type RemoteAccessPolicy = {
  id: string;
  organizationId: string;
  enabled: boolean;
  requireTrustedDevice: boolean;
  enrollmentTtlMinutes: number;
  idleTimeoutMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type RemoteAccessEmployee = {
  id: string;
  fullName: string;
  position: string | null;
};

export type RemoteAccessOverview = {
  organization: { id: string; displayName: string };
  policy: RemoteAccessPolicy;
  gateway: { publicUrl: string | null; configured: boolean };
  currentRemoteDeviceId: string | null;
  eligibleEmployees: Array<RemoteAccessEmployee & { roles: Array<{ code: string; title: string }> }>;
  devices: Array<{
    id: string;
    name: string;
    employee: RemoteAccessEmployee & { status: string };
    userAgent: string | null;
    lastIpAddress: string | null;
    lastSeenAt: string | null;
    trustedAt: string;
    revokedAt: string | null;
    activeSessions: number;
    current: boolean;
  }>;
  invitations: Array<{
    id: string;
    employee: RemoteAccessEmployee;
    createdBy: { id: string; fullName: string } | null;
    deviceName: string | null;
    expiresAt: string;
    usedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  }>;
  recentRemoteLogins: Array<{
    id: string;
    employee: RemoteAccessEmployee | null;
    device: { id: string; name: string } | null;
    ipAddress: string | null;
    loggedInAt: string;
  }>;
};

export type RemoteAccessInvitationResult = {
  id: string;
  code: string;
  enrollmentUrl: string;
  expiresAt: string;
  employee: { id: string; fullName: string };
};
