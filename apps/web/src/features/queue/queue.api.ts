import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import { ListQueueQuery, QueueEntry, QueueMutationInput, QueueScreenResponse, QueueWorkstation } from './types';

export function listQueue(query: ListQueueQuery) {
  return apiRequest<PaginatedResponse<QueueEntry>>(`/v1/queue${buildQuery(query)}`);
}

export function getQueueScreen() {
  return apiRequest<QueueScreenResponse>('/v1/queue/screen');
}

export function getQueueEntry(queueEntryId: string) {
  return apiRequest<QueueEntry>(`/v1/queue/${queueEntryId}`);
}

export function createQueueEntry(input: QueueMutationInput) {
  return apiRequest<QueueEntry>('/v1/queue', {
    method: 'POST',
    body: input,
  });
}

export function updateQueueEntry(queueEntryId: string, input: QueueMutationInput) {
  return apiRequest<QueueEntry>(`/v1/queue/${queueEntryId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function startQueueEntry(queueEntryId: string) {
  return apiRequest<QueueEntry>(`/v1/queue/${queueEntryId}/start`, { method: 'POST' });
}

export function registerQueueWorkstation(deviceId: string) {
  return apiRequest<QueueWorkstation>('/v1/queue/workstations/register', { method: 'POST', body: { deviceId } });
}

export function listQueueWorkstations() {
  return apiRequest<QueueWorkstation[]>('/v1/queue/workstations');
}

export function updateQueueWorkstation(workstationId: string, input: { roomId?: string; label?: string }) {
  return apiRequest<QueueWorkstation>(`/v1/queue/workstations/${workstationId}`, { method: 'PATCH', body: input });
}

export function completeQueueEntry(queueEntryId: string) {
  return apiRequest<QueueEntry>(`/v1/queue/${queueEntryId}/complete`, { method: 'POST' });
}

export function cancelQueueEntry(queueEntryId: string) {
  return apiRequest<QueueEntry>(`/v1/queue/${queueEntryId}/cancel`, { method: 'POST' });
}
