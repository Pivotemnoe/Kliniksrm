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

export function listOnlineRequestAttention() {
  return apiRequest<{ items: OnlineAppointmentRequest[]; total: number; checkedAt: string; escalationMinutes: number }>('/v1/online-requests/attention');
}

export function claimOnlineRequest(requestId: string) {
  return apiRequest<OnlineAppointmentRequest>(`/v1/online-requests/${encodeURIComponent(requestId)}/claim`, { method: 'POST' });
}

export function snoozeOnlineRequest(requestId: string) {
  return apiRequest<{ requestId: string; until: string }>(`/v1/online-requests/${encodeURIComponent(requestId)}/snooze`, { method: 'POST' });
}

export function releaseOnlineRequest(requestId: string) {
  return apiRequest<OnlineAppointmentRequest>(`/v1/online-requests/${encodeURIComponent(requestId)}/release`, { method: 'POST' });
}

export function sendConversationCommand(requestId: string, input: { clientKey: string; action: 'REPLY' | 'RESUME' | 'RESOLVE'; text?: string }) {
  return apiRequest(`/v1/online-requests/${encodeURIComponent(requestId)}/conversation`, { method: 'POST', body: input });
}
export type ConversationJob = { id: string; status: string; payload: { clientKey: string; action: string; text: string | null }; createdAt: string; error: string | null };
export function getConversationJobs(requestId: string) {
  return apiRequest<ConversationJob[]>(`/v1/online-requests/${encodeURIComponent(requestId)}/conversation-jobs`);
}
export function retryConversationJob(requestId: string, jobId: string) {
  return apiRequest(`/v1/online-requests/${encodeURIComponent(requestId)}/conversation-jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
}
