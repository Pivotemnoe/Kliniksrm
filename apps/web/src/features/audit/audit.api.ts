import { apiRequest } from '../../api/client';
import { AuditLogItem } from './types';

export function listAuditLogs() {
  return apiRequest<AuditLogItem[]>('/v1/audit-logs');
}
