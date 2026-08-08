import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import {
  Bill,
  BillAlertsResponse,
  BillSelectionResponse,
  BillItem,
  BillItemMutationInput,
  BillListItem,
  BulkPayBillsInput,
  CreateBillInput,
  CreatePaymentInput,
  ListBillsQuery,
  Payment,
  RefundPaymentInput,
  UpdateBillInput,
} from './types';

export function listBills(query: ListBillsQuery) {
  return apiRequest<PaginatedResponse<BillListItem>>(`/v1/bills${buildQuery(query)}`);
}

export function listBillAlerts(query: ListBillsQuery) {
  return apiRequest<BillAlertsResponse>(`/v1/bills/alerts${buildQuery(query)}`);
}

export function listBillSelection(query: ListBillsQuery) {
  return apiRequest<BillSelectionResponse>(`/v1/bills/selection${buildQuery(query)}`);
}

export function bulkCancelBills(billIds: string[]) {
  return apiRequest<{ count: number; billIds: string[] }>('/v1/bills/bulk-cancel', { method: 'POST', body: { billIds } });
}

export function bulkPayBills(input: BulkPayBillsInput) {
  return apiRequest<{ count: number; totalAmount: number; billIds: string[] }>('/v1/bills/bulk-pay', { method: 'POST', body: input });
}

export function createBill(input: CreateBillInput) {
  return apiRequest<Bill>('/v1/bills', { method: 'POST', body: input });
}

export function getBill(billId: string) {
  return apiRequest<Bill>(`/v1/bills/${billId}`);
}

export function updateBill(billId: string, input: UpdateBillInput) {
  return apiRequest<Bill>(`/v1/bills/${billId}`, { method: 'PATCH', body: input });
}

export function cancelBill(billId: string) {
  return apiRequest<Bill>(`/v1/bills/${billId}/cancel`, { method: 'POST' });
}

export function reopenBill(billId: string) {
  return apiRequest<Bill>(`/v1/bills/${billId}/reopen`, { method: 'POST' });
}

export function addBillItem(billId: string, input: BillItemMutationInput) {
  return apiRequest<BillItem>(`/v1/bills/${billId}/items`, { method: 'POST', body: input });
}

export function updateBillItem(billId: string, billItemId: string, input: BillItemMutationInput) {
  return apiRequest<BillItem>(`/v1/bills/${billId}/items/${billItemId}`, { method: 'PATCH', body: input });
}

export function deleteBillItem(billId: string, billItemId: string) {
  return apiRequest<{ deleted: boolean }>(`/v1/bills/${billId}/items/${billItemId}`, { method: 'DELETE' });
}

export function listPayments(billId: string) {
  return apiRequest<Payment[]>(`/v1/bills/${billId}/payments`);
}

export function createPayment(billId: string, input: CreatePaymentInput) {
  return apiRequest<Payment>(`/v1/bills/${billId}/payments`, { method: 'POST', body: input });
}

export function refundPayment(billId: string, paymentId: string, input: RefundPaymentInput) {
  return apiRequest<Payment>(`/v1/bills/${billId}/payments/${paymentId}/refund`, { method: 'POST', body: input });
}
