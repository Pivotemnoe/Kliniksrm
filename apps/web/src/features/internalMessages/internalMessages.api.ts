import { apiRequest } from '../../api/client';
import { buildQuery } from '../../shared/utils/query';
import {
  InternalMessage,
  InternalMessageConversationsResponse,
  InternalMessageEmployee,
  InternalMessageThreadResponse,
} from './types';

export function listInternalMessageRecipients() {
  return apiRequest<InternalMessageEmployee[]>('/v1/internal-messages/recipients');
}

export function listInternalMessageConversations() {
  return apiRequest<InternalMessageConversationsResponse>('/v1/internal-messages/conversations');
}

export function listInternalMessageThread(employeeId: string) {
  return apiRequest<InternalMessageThreadResponse>(
    `/v1/internal-messages${buildQuery({ employeeId, limit: 200 })}`,
  );
}

export function sendInternalMessage(input: { recipientId: string; body: string }) {
  return apiRequest<InternalMessage>('/v1/internal-messages', { method: 'POST', body: input });
}

export function markInternalMessageConversationRead(employeeId: string) {
  return apiRequest<{ ok: true; count: number }>(
    `/v1/internal-messages/conversations/${encodeURIComponent(employeeId)}/read`,
    { method: 'POST' },
  );
}
