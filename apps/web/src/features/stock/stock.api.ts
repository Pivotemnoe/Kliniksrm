import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import {
  Product,
  ProductMutationInput,
  ServiceItem,
  ServiceMutationInput,
  StockBatch,
  StockResources,
  SupplyInvoice,
  SupplyInvoiceMutationInput,
} from './types';

type StockListQuery = {
  search?: string;
  categoryId?: string;
  warehouseId?: string;
  limit?: number;
  offset?: number;
};

export function getStockResources() {
  return apiRequest<StockResources>('/v1/stock/resources');
}

export function listProducts(query: StockListQuery) {
  return apiRequest<PaginatedResponse<Product>>(`/v1/stock/products${buildQuery(query)}`);
}

export function listStockAlerts(query: StockListQuery) {
  return apiRequest<PaginatedResponse<Product>>(`/v1/stock/alerts${buildQuery(query)}`);
}

export function createProduct(input: ProductMutationInput) {
  return apiRequest<Product>('/v1/stock/products', { method: 'POST', body: input });
}

export function listServices(query: StockListQuery) {
  return apiRequest<PaginatedResponse<ServiceItem>>(`/v1/stock/services${buildQuery(query)}`);
}

export function createService(input: ServiceMutationInput) {
  return apiRequest<ServiceItem>('/v1/stock/services', { method: 'POST', body: input });
}

export function listStockBatches(query: StockListQuery) {
  return apiRequest<PaginatedResponse<StockBatch>>(`/v1/stock/batches${buildQuery(query)}`);
}

export function listSupplyInvoices(query: StockListQuery) {
  return apiRequest<PaginatedResponse<SupplyInvoice>>(`/v1/stock/supply-invoices${buildQuery(query)}`);
}

export function createSupplyInvoice(input: SupplyInvoiceMutationInput) {
  return apiRequest<SupplyInvoice>('/v1/stock/supply-invoices', { method: 'POST', body: input });
}
