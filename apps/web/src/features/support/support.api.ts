import { apiRequest } from '../../api/client';
import { AcceptanceStatus, ServerAcceptance, SupportOverview, SupportRequest, SupportRequestPriority, SupportRequestStatus } from './types';

export function getSupportOverview() {
  return apiRequest<SupportOverview>('/v1/support');
}

export function createSupportRequest(payload: {
  subject: string;
  message: string;
  priority: SupportRequestPriority;
  contact?: string;
  includeDiagnostics: boolean;
  diagnosticConsent: boolean;
}) {
  return apiRequest<SupportRequest>('/v1/support/requests', { method: 'POST', body: payload });
}

export function updateSupportRequest(requestId: string, payload: { status: SupportRequestStatus; response?: string; externalReference?: string }) {
  return apiRequest<SupportRequest>(`/v1/support/requests/${requestId}`, { method: 'PATCH', body: payload });
}

export function exportSafeDiagnostics() {
  return apiRequest<{ fileName: string; sha256: string; report: unknown }>('/v1/support/diagnostics', {
    method: 'POST', body: { confirmation: 'EXPORT_SAFE_DIAGNOSTICS' },
  });
}

export function importOfflineLicense(document: string, confirmation: string) {
  return apiRequest<SupportOverview['license']>('/v1/support/license', { method: 'POST', body: { document, confirmation } });
}

export function importAcceptanceReport(report: Record<string, unknown>, notes?: string) {
  return apiRequest<ServerAcceptance>('/v1/support/acceptance', { method: 'POST', body: { report, notes } });
}

export function acceptNewServer(acceptanceId: string, notes?: string) {
  return apiRequest<ServerAcceptance>(`/v1/support/acceptance/${acceptanceId}/accept`, {
    method: 'POST', body: { confirmation: 'ACCEPT_NEW_SERVER', notes },
  });
}

export const acceptanceStatuses: AcceptanceStatus[] = ['PREPARED', 'VERIFIED', 'ACCEPTED', 'REJECTED'];
