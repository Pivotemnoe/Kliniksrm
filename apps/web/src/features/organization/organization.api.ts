import { apiRequest } from '../../api/client';
import { OrganizationSettings, UpdateOrganizationPayload } from './types';

export function getOrganizationSettings() {
  return apiRequest<OrganizationSettings>('/v1/organization');
}

export function updateOrganizationSettings(payload: UpdateOrganizationPayload) {
  return apiRequest<OrganizationSettings>('/v1/organization', { method: 'PATCH', body: payload });
}
