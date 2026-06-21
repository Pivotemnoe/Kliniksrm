import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import {
  CreateVisitInput,
  ListVisitsQuery,
  UpdateVisitInput,
  Visit,
  VisitBillItem,
  VisitDiagnosis,
  VisitDiagnosisInput,
  VisitExam,
  VisitExamInput,
  VisitLaboratoryItemInput,
  VisitLaboratoryOrderInput,
  VisitListItem,
  VisitRecommendation,
  VisitRecommendationInput,
  VisitServiceLineInput,
} from './types';

export function listVisits(query: ListVisitsQuery) {
  return apiRequest<PaginatedResponse<VisitListItem>>(`/v1/visits${buildQuery(query)}`);
}

export function getVisit(visitId: string) {
  return apiRequest<Visit>(`/v1/visits/${visitId}`);
}

export function createVisit(input: CreateVisitInput) {
  return apiRequest<Visit>('/v1/visits', {
    method: 'POST',
    body: input,
  });
}

export function updateVisit(visitId: string, input: UpdateVisitInput) {
  return apiRequest<Visit>(`/v1/visits/${visitId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function startVisit(visitId: string) {
  return apiRequest<Visit>(`/v1/visits/${visitId}/start`, { method: 'POST' });
}

export function completeVisit(visitId: string) {
  return apiRequest<Visit>(`/v1/visits/${visitId}/complete`, { method: 'POST' });
}

export function cancelVisit(visitId: string) {
  return apiRequest<Visit>(`/v1/visits/${visitId}/cancel`, { method: 'POST' });
}

export function upsertVisitExam(visitId: string, input: VisitExamInput) {
  return apiRequest<VisitExam>(`/v1/visits/${visitId}/exam`, {
    method: 'PUT',
    body: input,
  });
}

export function upsertVisitRecommendation(visitId: string, input: VisitRecommendationInput) {
  return apiRequest<VisitRecommendation>(`/v1/visits/${visitId}/recommendation`, {
    method: 'PUT',
    body: input,
  });
}

export function createVisitDiagnosis(visitId: string, input: VisitDiagnosisInput) {
  return apiRequest<VisitDiagnosis>(`/v1/visits/${visitId}/diagnoses`, {
    method: 'POST',
    body: input,
  });
}

export function updateVisitDiagnosis(visitId: string, diagnosisId: string, input: VisitDiagnosisInput) {
  return apiRequest<VisitDiagnosis>(`/v1/visits/${visitId}/diagnoses/${diagnosisId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteVisitDiagnosis(visitId: string, diagnosisId: string) {
  return apiRequest<{ deleted: true }>(`/v1/visits/${visitId}/diagnoses/${diagnosisId}`, { method: 'DELETE' });
}

export function addVisitService(visitId: string, input: VisitServiceLineInput) {
  return apiRequest<VisitBillItem>(`/v1/visits/${visitId}/services`, {
    method: 'POST',
    body: input,
  });
}

export function updateVisitService(visitId: string, billItemId: string, input: VisitServiceLineInput) {
  return apiRequest<VisitBillItem>(`/v1/visits/${visitId}/services/${billItemId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteVisitService(visitId: string, billItemId: string) {
  return apiRequest<{ deleted: true }>(`/v1/visits/${visitId}/services/${billItemId}`, { method: 'DELETE' });
}

export function createVisitLaboratoryOrder(visitId: string, input: VisitLaboratoryOrderInput) {
  return apiRequest<Visit>(`/v1/visits/${visitId}/laboratory-orders`, {
    method: 'POST',
    body: input,
  });
}

export function updateVisitLaboratoryItem(visitId: string, orderId: string, itemId: string, input: VisitLaboratoryItemInput) {
  return apiRequest<Visit>(`/v1/visits/${visitId}/laboratory-orders/${orderId}/items/${itemId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function cancelVisitLaboratoryOrder(visitId: string, orderId: string) {
  return apiRequest<Visit>(`/v1/visits/${visitId}/laboratory-orders/${orderId}/cancel`, {
    method: 'POST',
  });
}
