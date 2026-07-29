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
  StockDocument,
  StockDocumentMutationInput,
  StockMovement,
  SupplierBalance,
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

export function updateProduct(productId: string, input: ProductMutationInput) {
  return apiRequest<Product>(`/v1/stock/products/${productId}`, { method: 'PATCH', body: input });
}

export function listServices(query: StockListQuery) {
  return apiRequest<PaginatedResponse<ServiceItem>>(`/v1/stock/services${buildQuery(query)}`);
}

export function createService(input: ServiceMutationInput) {
  return apiRequest<ServiceItem>('/v1/stock/services', { method: 'POST', body: input });
}

export function updateService(serviceId: string, input: ServiceMutationInput) {
  return apiRequest<ServiceItem>(`/v1/stock/services/${serviceId}`, { method: 'PATCH', body: input });
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

export function listStockDocuments(query: StockListQuery & { type?: string; status?: string }) {
  return apiRequest<PaginatedResponse<StockDocument>>(`/v1/stock/documents${buildQuery(query)}`);
}

export function createStockDocument(input: StockDocumentMutationInput) {
  return apiRequest<StockDocument>('/v1/stock/documents', { method: 'POST', body: input });
}

export function postStockDocument(documentId: string) {
  return apiRequest<StockDocument>(`/v1/stock/documents/${documentId}/post`, { method: 'POST' });
}

export function cancelStockDocument(documentId: string) {
  return apiRequest<StockDocument>(`/v1/stock/documents/${documentId}/cancel`, { method: 'POST' });
}

export function listStockMovements(query: StockListQuery) {
  return apiRequest<PaginatedResponse<StockMovement>>(`/v1/stock/movements${buildQuery(query)}`);
}

export function listSupplierBalances() {
  return apiRequest<SupplierBalance[]>('/v1/stock/supplier-balances');
}

export function createSupplierPayment(input: { supplierId: string; supplyInvoiceId?: string; cashboxId?: string; paymentMethodId?: string; amount: number; paidAt?: string; comment?: string }) {
  return apiRequest('/v1/stock/supplier-payments', { method: 'POST', body: input });
}
