import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import { AdmitHospitalInput, HospitalResources, HospitalStay } from './types';

type HospitalListQuery = {
  search?: string;
  hospitalBoxId?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export function listHospital(query: HospitalListQuery) {
  return apiRequest<PaginatedResponse<HospitalStay>>(`/v1/hospital${buildQuery(query)}`);
}

export function getHospitalResources() {
  return apiRequest<HospitalResources>('/v1/hospital/resources');
}

export function admitHospitalPatient(input: AdmitHospitalInput) {
  return apiRequest<HospitalStay>('/v1/hospital', { method: 'POST', body: input });
}

export function updateHospitalStay(visitId: string, input: Partial<Pick<AdmitHospitalInput, 'employeeId' | 'hospitalBoxId'>>) {
  return apiRequest<HospitalStay>(`/v1/hospital/${visitId}`, { method: 'PATCH', body: input });
}

export function dischargeHospitalStay(visitId: string) {
  return apiRequest<HospitalStay>(`/v1/hospital/${visitId}/discharge`, { method: 'POST' });
}

export function cancelHospitalStay(visitId: string) {
  return apiRequest<HospitalStay>(`/v1/hospital/${visitId}/cancel`, { method: 'POST' });
}
