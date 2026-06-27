import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import {
  LaboratoryListQuery,
  LaboratoryOrder,
  LaboratoryOrderInput,
  LaboratoryOrderItem,
  LaboratoryOrderItemInput,
  LaboratoryOrdersQuery,
  LaboratoryProfile,
  LaboratoryProfileInput,
  LaboratoryResources,
  LaboratoryTest,
  LaboratoryTestInput,
} from './types';

export function getLaboratoryResources() {
  return apiRequest<LaboratoryResources>('/v1/laboratory/resources');
}

export function listLaboratoryOrders(query: LaboratoryOrdersQuery) {
  return apiRequest<PaginatedResponse<LaboratoryOrder>>(`/v1/laboratory/orders${buildQuery(query)}`);
}

export function updateLaboratoryOrder(orderId: string, input: LaboratoryOrderInput) {
  return apiRequest<LaboratoryOrder>(`/v1/laboratory/orders/${orderId}`, { method: 'PATCH', body: input });
}

export function updateLaboratoryOrderItem(orderId: string, itemId: string, input: LaboratoryOrderItemInput) {
  return apiRequest<LaboratoryOrderItem>(`/v1/laboratory/orders/${orderId}/items/${itemId}`, { method: 'PATCH', body: input });
}

export function listLaboratoryTests(query: LaboratoryListQuery) {
  return apiRequest<PaginatedResponse<LaboratoryTest>>(`/v1/laboratory/tests${buildQuery(query)}`);
}

export function createLaboratoryTest(input: LaboratoryTestInput) {
  return apiRequest<LaboratoryTest>('/v1/laboratory/tests', { method: 'POST', body: input });
}

export function updateLaboratoryTest(testId: string, input: Partial<LaboratoryTestInput>) {
  return apiRequest<LaboratoryTest>(`/v1/laboratory/tests/${testId}`, { method: 'PATCH', body: input });
}

export function listLaboratoryProfiles(query: LaboratoryListQuery) {
  return apiRequest<PaginatedResponse<LaboratoryProfile>>(`/v1/laboratory/profiles${buildQuery(query)}`);
}

export function createLaboratoryProfile(input: LaboratoryProfileInput) {
  return apiRequest<LaboratoryProfile>('/v1/laboratory/profiles', { method: 'POST', body: input });
}

export function updateLaboratoryProfile(profileId: string, input: Partial<LaboratoryProfileInput>) {
  return apiRequest<LaboratoryProfile>(`/v1/laboratory/profiles/${profileId}`, { method: 'PATCH', body: input });
}
