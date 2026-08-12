import { apiRequest } from '../../api/client';
import { buildQuery } from '../../shared/utils/query';
import { BusinessCategory, BusinessCategoryInput, BusinessDailyClose, BusinessEntry, BusinessEntryCorrectionInput, BusinessEntryInput, BusinessResources, BusinessSummary, DirectorBriefing, DirectorBriefingSettings } from './types';

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

export function createBusinessEntries(inputs: BusinessEntryInput[]) {
  return apiRequest<BusinessEntry[]>('/v1/business/entries/batch', { method: 'POST', body: { entries: inputs } });
}

export function voidBusinessEntry(entryId: string, reason: string) {
  return apiRequest<BusinessEntry>(`/v1/business/entries/${entryId}/void`, { method: 'POST', body: { reason } });
}

export function correctBusinessEntry(entryId: string, input: BusinessEntryCorrectionInput) {
  return apiRequest<BusinessEntry>(`/v1/business/entries/${entryId}/correct`, { method: 'PUT', body: input });
}

export function resolveBusinessEntry(entryId: string, reason: string) {
  return apiRequest<BusinessEntry>(`/v1/business/entries/${entryId}/resolve`, { method: 'POST', body: { reason } });
}

export function listBusinessCategories() {
  return apiRequest<BusinessCategory[]>('/v1/business/categories');
}

export function saveBusinessCategory(categoryId: string | null, input: BusinessCategoryInput) {
  return apiRequest<BusinessCategory>(categoryId ? `/v1/business/categories/${categoryId}` : '/v1/business/categories', {
    method: categoryId ? 'PUT' : 'POST',
    body: input,
  });
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

export function getDirectorBriefingSettings() {
  return apiRequest<DirectorBriefingSettings>('/v1/director-briefing/settings');
}

export function updateDirectorBriefingSettings(input: { enabled: boolean; time: string; timezone: string }) {
  return apiRequest<DirectorBriefingSettings>('/v1/director-briefing/settings', { method: 'PATCH', body: input });
}

export function listDirectorBriefings() {
  return apiRequest<DirectorBriefing[]>('/v1/director-briefing');
}

export function generateDirectorBriefing() {
  return apiRequest<DirectorBriefing>('/v1/director-briefing/generate', { method: 'POST' });
}
