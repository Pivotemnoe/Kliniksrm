import { apiRequest } from '../../api/client';
import { StaffAlertsResponse } from './types';

export function listStaffAlerts() {
  return apiRequest<StaffAlertsResponse>('/v1/staff-alerts');
}

export function markStaffAlertRead(alertKey: string) {
  return apiRequest<{ ok: true; alertKey: string; readAt: string }>(
    `/v1/staff-alerts/${encodeURIComponent(alertKey)}/read`,
    { method: 'POST' },
  );
}

export function markAllStaffAlertsRead() {
  return apiRequest<{ ok: true; count: number; readAt: string }>('/v1/staff-alerts/read-all', { method: 'POST' });
}
