import { apiRequest } from '../../api/client';
import { Cashbox, CashboxInput, FinanceSettings, PaymentMethod, PaymentMethodInput } from './types';

export function getFinanceSettings() {
  return apiRequest<FinanceSettings>('/v1/finance/settings');
}

export function createPaymentMethod(input: PaymentMethodInput) {
  return apiRequest<PaymentMethod>('/v1/finance/payment-methods', { method: 'POST', body: input });
}

export function updatePaymentMethod(paymentMethodId: string, input: PaymentMethodInput) {
  return apiRequest<PaymentMethod>(`/v1/finance/payment-methods/${paymentMethodId}`, { method: 'PATCH', body: input });
}

export function createCashbox(input: CashboxInput) {
  return apiRequest<Cashbox>('/v1/finance/cashboxes', { method: 'POST', body: input });
}

export function updateCashbox(cashboxId: string, input: CashboxInput) {
  return apiRequest<Cashbox>(`/v1/finance/cashboxes/${cashboxId}`, { method: 'PATCH', body: input });
}
