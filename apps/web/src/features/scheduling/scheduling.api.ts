import { apiRequest } from '../../api/client';
import { SchedulingResourcePayload, SchedulingResources, SchedulingSettings, UpdateClinicOfficePayload } from './types';

export function getSchedulingResources() {
  return apiRequest<SchedulingResources>('/v1/scheduling/resources');
}

export function getSchedulingSettings() {
  return apiRequest<SchedulingSettings>('/v1/scheduling/settings');
}

export function updateClinicOffice(officeId: string, payload: UpdateClinicOfficePayload) {
  return apiRequest(`/v1/scheduling/offices/${officeId}`, { method: 'PATCH', body: payload });
}

export function createRoom(payload: SchedulingResourcePayload) {
  return apiRequest('/v1/scheduling/rooms', { method: 'POST', body: payload });
}

export function updateRoom(roomId: string, payload: SchedulingResourcePayload) {
  return apiRequest(`/v1/scheduling/rooms/${roomId}`, { method: 'PATCH', body: payload });
}

export function createHospitalBox(payload: SchedulingResourcePayload) {
  return apiRequest('/v1/scheduling/hospital-boxes', { method: 'POST', body: payload });
}

export function updateHospitalBox(hospitalBoxId: string, payload: SchedulingResourcePayload) {
  return apiRequest(`/v1/scheduling/hospital-boxes/${hospitalBoxId}`, { method: 'PATCH', body: payload });
}

export function createWarehouse(payload: SchedulingResourcePayload) {
  return apiRequest('/v1/scheduling/warehouses', { method: 'POST', body: payload });
}

export function updateWarehouse(warehouseId: string, payload: SchedulingResourcePayload) {
  return apiRequest(`/v1/scheduling/warehouses/${warehouseId}`, { method: 'PATCH', body: payload });
}
