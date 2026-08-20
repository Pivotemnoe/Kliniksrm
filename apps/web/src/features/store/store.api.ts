import { apiRequest } from '../../api/client';
import type { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import type { StoreProduct, StoreProductInput, StoreResources } from './types';

export function getStoreResources() {
  return apiRequest<StoreResources>('/v1/store/resources');
}

export function listStoreProducts(query: { search?: string; limit?: number; offset?: number }) {
  return apiRequest<PaginatedResponse<StoreProduct>>(`/v1/store/products${buildQuery(query)}`);
}

export function createStoreProduct(input: StoreProductInput) {
  return apiRequest<StoreProduct>('/v1/store/products', { method: 'POST', body: input });
}

export function updateStoreProduct(productId: string, input: Partial<StoreProductInput>) {
  return apiRequest<StoreProduct>(`/v1/store/products/${productId}`, { method: 'PATCH', body: input });
}

export function deleteStoreProduct(productId: string) {
  return apiRequest<{ id: string; title: string; deleted: true }>(`/v1/store/products/${productId}`, { method: 'DELETE' });
}

export function importStoreProducts(items: StoreProductInput[]) {
  return apiRequest<{ created: number; updated: number; total: number; items: StoreProduct[] }>('/v1/store/products/import', {
    method: 'POST',
    body: { items },
  });
}
