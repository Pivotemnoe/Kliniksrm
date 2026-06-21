import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import { CreateSaleInput, ListSalesQuery, Sale, SaleListItem } from './types';

export function listSales(query: ListSalesQuery) {
  return apiRequest<PaginatedResponse<SaleListItem>>(`/v1/sales${buildQuery(query)}`);
}

export function getSale(saleId: string) {
  return apiRequest<Sale>(`/v1/sales/${saleId}`);
}

export function createSale(input: CreateSaleInput) {
  return apiRequest<Sale>('/v1/sales', { method: 'POST', body: input });
}
