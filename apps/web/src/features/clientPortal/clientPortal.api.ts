import { apiRequest } from '../../api/client';
import {
  ClientPortalCodeRequestResponse,
  ClientPortalCodeVerifyResponse,
  ClientPortalSummary,
  CreatePortalOnlineRequestInput,
  PortalOnlineRequest,
} from './types';

export function getClientPortalSummary(token: string) {
  return apiRequest<ClientPortalSummary>(`/v1/client-portal/${encodeURIComponent(token)}`);
}

export function requestClientPortalCode(input: { phone: string }) {
  return apiRequest<ClientPortalCodeRequestResponse>('/v1/client-portal/auth/request-code', {
    method: 'POST',
    body: input,
  });
}

export function verifyClientPortalCode(input: { phone: string; code: string }) {
  return apiRequest<ClientPortalCodeVerifyResponse>('/v1/client-portal/auth/verify-code', {
    method: 'POST',
    body: input,
  });
}

export function createPortalOnlineRequest(token: string, input: CreatePortalOnlineRequestInput) {
  return apiRequest<PortalOnlineRequest>(`/v1/client-portal/${encodeURIComponent(token)}/online-requests`, {
    method: 'POST',
    body: input,
  });
}
