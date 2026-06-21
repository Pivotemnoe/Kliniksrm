import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import {
  ClientPortalAccess,
  CreateNotificationInput,
  NotificationChannel,
  NotificationOutboxItem,
  NotificationStatus,
  NotificationTemplate,
  UpdatePortalAccessInput,
  UpsertNotificationTemplateInput,
} from './types';

export type ListNotificationsQuery = {
  limit?: number;
  offset?: number;
  status?: NotificationStatus;
  channel?: NotificationChannel;
  ownerId?: string;
  animalId?: string;
};

export type ListTemplatesQuery = {
  channel?: string;
  isActive?: boolean;
};

export function listNotificationOutbox(query: ListNotificationsQuery = {}) {
  return apiRequest<PaginatedResponse<NotificationOutboxItem>>(`/v1/notifications/outbox${buildQuery(query)}`);
}

export function createNotification(input: CreateNotificationInput) {
  return apiRequest<NotificationOutboxItem>('/v1/notifications/outbox', {
    method: 'POST',
    body: input,
  });
}

export function retryNotification(notificationId: string) {
  return apiRequest<NotificationOutboxItem>(`/v1/notifications/outbox/${notificationId}/retry`, { method: 'POST' });
}

export function cancelNotification(notificationId: string) {
  return apiRequest<NotificationOutboxItem>(`/v1/notifications/outbox/${notificationId}/cancel`, { method: 'POST' });
}

export function listNotificationTemplates(query: ListTemplatesQuery = {}) {
  return apiRequest<NotificationTemplate[]>(`/v1/notifications/templates${buildQuery(query)}`);
}

export function upsertNotificationTemplate(input: UpsertNotificationTemplateInput) {
  return apiRequest<NotificationTemplate>('/v1/notifications/templates', {
    method: 'POST',
    body: input,
  });
}

export function getPortalAccess(ownerId: string) {
  return apiRequest<ClientPortalAccess>(`/v1/notifications/owners/${ownerId}/portal-access`);
}

export function updatePortalAccess(ownerId: string, input: UpdatePortalAccessInput) {
  return apiRequest<ClientPortalAccess>(`/v1/notifications/owners/${ownerId}/portal-access`, {
    method: 'PATCH',
    body: input,
  });
}
