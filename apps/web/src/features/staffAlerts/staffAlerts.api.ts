import { apiRequest } from '../../api/client';
import { StaffAlertsResponse } from './types';

export function listStaffAlerts() {
  return apiRequest<StaffAlertsResponse>('/v1/staff-alerts');
}

export function markStaffAlertRead(alert: string | { key: string; version: string }) {
  const alertKey = typeof alert === 'string' ? alert : alert.key;
  return apiRequest<{ ok: true; alertKey: string; readAt: string }>(
    `/v1/staff-alerts/${encodeURIComponent(alertKey)}/read`,
    { method: 'POST', ...(typeof alert === 'string' ? {} : { body: { version: alert.version } }) },
  );
}

export function markAllStaffAlertsRead() {
  return apiRequest<{ ok: true; count: number; readAt: string }>('/v1/staff-alerts/read-all', { method: 'POST' });
}
