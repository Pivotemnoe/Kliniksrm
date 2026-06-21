import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import {
  AcceptOnlineRequestInput,
  CreateOnlineRequestInput,
  ListOnlineRequestsQuery,
  OnlineAppointmentRequest,
  UpdateOnlineRequestInput,
} from './types';

export function listOnlineRequests(query: ListOnlineRequestsQuery = {}) {
  return apiRequest<PaginatedResponse<OnlineAppointmentRequest>>(`/v1/online-requests${buildQuery(query)}`);
}

export function getOnlineRequest(requestId: string) {
  return apiRequest<OnlineAppointmentRequest>(`/v1/online-requests/${requestId}`);
}

export function createOnlineRequest(input: CreateOnlineRequestInput) {
  return apiRequest<OnlineAppointmentRequest>('/v1/online-requests', { method: 'POST', body: input });
}

export function updateOnlineRequest(requestId: string, input: UpdateOnlineRequestInput) {
  return apiRequest<OnlineAppointmentRequest>(`/v1/online-requests/${requestId}`, { method: 'PATCH', body: input });
}

export function acceptOnlineRequest(requestId: string, input: AcceptOnlineRequestInput) {
  return apiRequest<OnlineAppointmentRequest>(`/v1/online-requests/${requestId}/accept`, { method: 'POST', body: input });
}

export function cancelOnlineRequest(requestId: string) {
  return apiRequest<OnlineAppointmentRequest>(`/v1/online-requests/${requestId}/cancel`, { method: 'POST' });
}

export function archiveOnlineRequest(requestId: string) {
  return apiRequest<OnlineAppointmentRequest>(`/v1/online-requests/${requestId}/archive`, { method: 'POST' });
}
