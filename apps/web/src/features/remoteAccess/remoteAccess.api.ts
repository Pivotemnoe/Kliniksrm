import { apiRequest } from '../../api/client';
import type { RemoteAccessInvitationResult, RemoteAccessOverview, RemoteAccessPolicy } from './types';

export function getRemoteAccessOverview() {
  return apiRequest<RemoteAccessOverview>('/v1/remote-access');
}

export function updateRemoteAccessPolicy(input: Partial<Pick<RemoteAccessPolicy, 'enabled' | 'enrollmentTtlMinutes' | 'idleTimeoutMinutes'>>) {
  return apiRequest<RemoteAccessPolicy>('/v1/remote-access/policy', { method: 'PATCH', body: input });
}

export function createRemoteAccessInvitation(input: { employeeId: string; deviceName?: string }) {
  return apiRequest<RemoteAccessInvitationResult>('/v1/remote-access/invitations', { method: 'POST', body: input });
}

export function revokeRemoteAccessInvitation(invitationId: string) {
  return apiRequest<{ ok: true }>(`/v1/remote-access/invitations/${invitationId}`, { method: 'DELETE' });
}

export function revokeRemoteAccessDevice(deviceId: string) {
  return apiRequest<{ ok: true }>(`/v1/remote-access/devices/${deviceId}`, { method: 'DELETE' });
}

export function revokeAllRemoteAccessDevices() {
  return apiRequest<{ ok: true; count: number }>('/v1/remote-access/devices/revoke-all', { method: 'POST' });
}

export function enrollRemoteAccessDevice(input: { code: string; deviceName?: string }) {
  return apiRequest<{ device: { id: string; name: string; employeeName: string }; next: string }>('/v1/remote-access/enroll', {
    method: 'POST',
    body: input,
  });
}
