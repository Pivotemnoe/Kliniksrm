import { apiRequest } from '../../api/client';
import { PayrollPeriod, PayrollProfile, PayrollProfileInput, PayrollResources } from './types';

export function getPayrollResources() {
  return apiRequest<PayrollResources>('/v1/payroll/resources');
}

export function savePayrollProfile(employeeId: string, input: PayrollProfileInput) {
  return apiRequest<PayrollProfile>(`/v1/payroll/profiles/${employeeId}`, { method: 'PUT', body: input });
}

export function listPayrollPeriods() {
  return apiRequest<PayrollPeriod[]>('/v1/payroll/periods');
}

export function getPayrollPeriod(periodId: string) {
  return apiRequest<PayrollPeriod>(`/v1/payroll/periods/${periodId}`);
}

export function createPayrollPeriod(input: { title: string; startsAt: string; endsAt: string }) {
  return apiRequest<PayrollPeriod>('/v1/payroll/periods', { method: 'POST', body: input });
}

export function recalculatePayrollPeriod(periodId: string) {
  return apiRequest<PayrollPeriod>(`/v1/payroll/periods/${periodId}/recalculate`, { method: 'POST' });
}

export function addPayrollAdjustment(periodId: string, input: { employeeId: string; amount: number; reason: string }) {
  return apiRequest<PayrollPeriod>(`/v1/payroll/periods/${periodId}/adjustments`, { method: 'POST', body: input });
}

export function addPayrollManualAccrual(periodId: string, input: { employeeId: string; amount: number; accruedAt: string; reason: string }) {
  return apiRequest<PayrollPeriod>(`/v1/payroll/periods/${periodId}/manual-accruals`, { method: 'POST', body: input });
}

export function approvePayrollPeriod(periodId: string) {
  return apiRequest<PayrollPeriod>(`/v1/payroll/periods/${periodId}/approve`, { method: 'POST' });
}
