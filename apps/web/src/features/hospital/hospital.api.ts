import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import { AdmitHospitalInput, CreateHospitalAmendmentInput, CreateHospitalRecordInput, CreateHospitalTreatmentPlanInput, HospitalCatalog, HospitalRecord, HospitalResources, HospitalStay, HospitalStayStatus, HospitalTreatmentPlan, UpdateHospitalRecordInput } from './types';

type HospitalListQuery = {
  search?: string;
  hospitalBoxId?: string;
  status?: HospitalStayStatus;
  limit?: number;
  offset?: number;
};

export function listHospital(query: HospitalListQuery) {
  return apiRequest<PaginatedResponse<HospitalStay>>(`/v1/hospital${buildQuery(query)}`);
}

export function getHospitalResources() {
  return apiRequest<HospitalResources>('/v1/hospital/resources');
}

export function getHospitalCatalog(search?: string) {
  return apiRequest<HospitalCatalog>(`/v1/hospital/catalog${buildQuery({ search })}`);
}

export function getHospitalStay(stayId: string) {
  return apiRequest<HospitalStay>(`/v1/hospital/${stayId}`);
}

export function createHospitalRecord(stayId: string, input: CreateHospitalRecordInput) {
  return apiRequest<HospitalRecord>(`/v1/hospital/${stayId}/records`, { method: 'POST', body: input });
}

export function createHospitalTreatmentPlan(stayId: string, input: CreateHospitalTreatmentPlanInput) {
  return apiRequest<HospitalTreatmentPlan>(`/v1/hospital/${stayId}/treatment-plans`, { method: 'POST', body: input });
}

export function updateHospitalRecord(stayId: string, recordId: string, input: UpdateHospitalRecordInput) {
  return apiRequest<HospitalRecord>(`/v1/hospital/${stayId}/records/${recordId}`, { method: 'PATCH', body: input });
}

export function createHospitalAmendment(stayId: string, recordId: string, input: CreateHospitalAmendmentInput) {
  return apiRequest<HospitalRecord>(`/v1/hospital/${stayId}/records/${recordId}/amendments`, { method: 'POST', body: input });
}

export function admitExistingHospitalStay(visitId: string, input: Pick<AdmitHospitalInput, 'hospitalBoxId' | 'employeeId'>) {
  return apiRequest<HospitalStay>(`/v1/hospital/${visitId}/admit`, { method: 'POST', body: input });
}

export function admitHospitalPatient(input: AdmitHospitalInput) {
  return apiRequest<HospitalStay>('/v1/hospital', { method: 'POST', body: input });
}

export function updateHospitalStay(stayId: string, input: Partial<Pick<AdmitHospitalInput, 'employeeId' | 'hospitalBoxId'>>) {
  return apiRequest<HospitalStay>(`/v1/hospital/${stayId}`, { method: 'PATCH', body: input });
}

export function dischargeHospitalStay(stayId: string) {
  return apiRequest<HospitalStay>(`/v1/hospital/${stayId}/discharge`, { method: 'POST' });
}

export function cancelHospitalStay(stayId: string) {
  return apiRequest<HospitalStay>(`/v1/hospital/${stayId}/cancel`, { method: 'POST' });
}
