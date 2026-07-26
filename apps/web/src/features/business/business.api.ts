import { apiRequest } from '../../api/client';
import { buildQuery } from '../../shared/utils/query';
import { BusinessDailyClose, BusinessEntry, BusinessEntryInput, BusinessResources, BusinessSummary } from './types';

type RangeQuery = { from?: string; to?: string; officeId?: string };

export function getBusinessResources() {
  return apiRequest<BusinessResources>('/v1/business/resources');
}

export function listBusinessEntries(query: RangeQuery & { type?: string; status?: string; dailyCloseId?: string }) {
  return apiRequest<BusinessEntry[]>(`/v1/business/entries${buildQuery(query)}`);
}

export function createBusinessEntry(input: BusinessEntryInput) {
  return apiRequest<BusinessEntry>('/v1/business/entries', { method: 'POST', body: input });
}

export function voidBusinessEntry(entryId: string, reason: string) {
  return apiRequest<BusinessEntry>(`/v1/business/entries/${entryId}/void`, { method: 'POST', body: { reason } });
}

export function resolveBusinessEntry(entryId: string, reason: string) {
  return apiRequest<BusinessEntry>(`/v1/business/entries/${entryId}/resolve`, { method: 'POST', body: { reason } });
}

export function getDailyClose(officeId: string, businessDate: string) {
  return apiRequest<BusinessDailyClose | null>(`/v1/business/daily-closes/current${buildQuery({ officeId, businessDate })}`);
}

export function prepareDailyClose(input: { officeId: string; businessDate: string; lines?: Array<{ lineKey: string; actualAmount: number; comment?: string }>; comment?: string }) {
  return apiRequest<BusinessDailyClose>('/v1/business/daily-closes/prepare', { method: 'POST', body: input });
}

export function submitDailyClose(closeId: string) {
  return apiRequest<BusinessDailyClose>(`/v1/business/daily-closes/${closeId}/submit`, { method: 'POST' });
}

export function approveDailyClose(closeId: string) {
  return apiRequest<BusinessDailyClose>(`/v1/business/daily-closes/${closeId}/approve`, { method: 'POST' });
}

export function returnDailyClose(closeId: string, reason: string) {
  return apiRequest<BusinessDailyClose>(`/v1/business/daily-closes/${closeId}/return`, { method: 'POST', body: { reason } });
}

export function getBusinessSummary(query: RangeQuery) {
  return apiRequest<BusinessSummary>(`/v1/business/summary${buildQuery(query)}`);
}
