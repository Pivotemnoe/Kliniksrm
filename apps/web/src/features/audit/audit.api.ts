import { apiRequest } from '../../api/client';
import { buildQuery } from '../../shared/utils/query';
import { AuditLogItem } from './types';

export function listAuditLogs() {
  return apiRequest<AuditLogItem[]>('/v1/audit-logs');
}

export type ActivityLogInput = {
  type: 'page_view' | 'heartbeat' | 'frontend_error';
  path?: string;
  title?: string;
  details?: Record<string, unknown>;
};

export type AuditExportQuery = {
  from?: string;
  to?: string;
  limit?: number;
};

export function logActivity(input: ActivityLogInput) {
  return apiRequest<{ id: string }>('/v1/audit-logs/activity', {
    method: 'POST',
    body: input,
  });
}

export function exportAuditReport(query: AuditExportQuery = {}) {
  return apiRequest<unknown>(`/v1/audit-logs/export${buildQuery(query)}`);
}
