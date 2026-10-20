import { apiBaseUrl, apiDownload, apiRequest, apiUpload } from '../../api/client';
import type { Direction } from './avito.api';
export type ListingContent = { title: string; description: string; serviceId: string | null; officeId: string | null; brief: string; marketingRules: string; photoIds: string[] };
export type ListingFacts = { service: { id: string; title: string; priceText: string | null } | null; office: { id: string; name: string; address: string | null; phone: string | null } | null; programmeTable?: import('./avito.api').ClinicProgrammeTable & { priceText: string } };
export type PublishingCheck = { checkedAt: string; accountId: string; profileHttpStatus: number | null; fieldsHttpStatus: number | null; writeTested: false; operations: { key: string; schemaSupported: boolean; access: string; note: string }[] };
export type EditorCatalog = { services: NonNullable<ListingFacts['service']>[]; offices: NonNullable<ListingFacts['office']>[]; publishingCheck: PublishingCheck | null; livePublishingEnabled: false; aiConfigured: boolean; defaultMarketingRules: string };
export type DraftSummary = { id: string; title: string; sourceListingId: string | null; direction: Direction; status: string; version: number; updatedAt: string };
export type ListingDraft = DraftSummary & { content: ListingContent; facts: ListingFacts; approvalCurrent: boolean; issues: { errors: string[]; warnings: string[]; canApprove: boolean }; media: { id: string; originalName: string; mimeType: string; sizeBytes: number }[]; revisions: { id: string; version: number; createdAt: string }[] };
const base = '/v1/avito/editor';
const path = (id: string) => `${base}/drafts/${encodeURIComponent(id)}`;
export const avitoEditorApi = {
  catalog: () => apiRequest<EditorCatalog>(`${base}/catalog`),
  check: () => apiRequest<PublishingCheck>(`${base}/access/check`, { method: 'POST' }),
  list: () => apiRequest<DraftSummary[]>(`${base}/drafts`),
  get: (id: string) => apiRequest<ListingDraft>(path(id)),
  create: (direction: Direction, sourceListingId?: string) => apiRequest<ListingDraft>(`${base}/drafts`, { method: 'POST', body: { clientKey: crypto.randomUUID(), direction, ...(sourceListingId ? { sourceListingId } : {}) } }),
  save: (id: string, version: number, content: ListingContent) => apiRequest<ListingDraft>(path(id), { method: 'PATCH', body: { version, content } }),
  upload: (id: string, version: number, file: File) => apiUpload<ListingDraft>(`${path(id)}/photos`, file, { version: String(version) }),
  approve: (id: string, version: number) => apiRequest<ListingDraft>(`${path(id)}/approve`, { method: 'POST', body: { version } }),
  restore: (id: string, version: number, revision: number) => apiRequest<ListingDraft>(`${path(id)}/restore`, { method: 'POST', body: { version, revision } }),
  generate: (id: string, version: number, mode: 'TEMPLATE' | 'AI', clientKey: string) => apiRequest<{ title: string; description: string; mode: string; saved: false }>(`${path(id)}/generate`, { method: 'POST', body: { version, mode, clientKey } }),
  package: (id: string) => apiDownload(`${path(id)}/package`),
  photo: (id: string, photoId: string) => `${apiBaseUrl}${path(id)}/photos/${encodeURIComponent(photoId)}`,
};
