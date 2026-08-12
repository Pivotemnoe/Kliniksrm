import { apiRequest, apiUpload } from '../../api/client';
import { OrganizationPrintProfile, OrganizationSettings, UpdateOrganizationPayload } from './types';

export function getOrganizationSettings() {
  return apiRequest<OrganizationSettings>('/v1/organization');
}

export function getOrganizationPrintProfile() {
  return apiRequest<OrganizationPrintProfile>('/v1/organization/print-profile');
}

export function updateOrganizationSettings(payload: UpdateOrganizationPayload) {
  return apiRequest<OrganizationSettings>('/v1/organization', { method: 'PATCH', body: payload });
}

export function uploadOrganizationLogo(file: File) {
  return apiUpload<OrganizationSettings>('/v1/organization/logo', file);
}

export function deleteOrganizationLogo() {
  return apiRequest<OrganizationSettings>('/v1/organization/logo', { method: 'DELETE' });
}
