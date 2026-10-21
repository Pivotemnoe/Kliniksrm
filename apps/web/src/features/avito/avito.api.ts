import { apiRequest } from '../../api/client';
export type Direction = 'CLINIC' | 'GROOMING' | 'HOTEL';
export const directionLabels: Record<string, string> = { CLINIC: 'Клиника', GROOMING: 'Груминг', HOTEL: 'Зоогостиница', UNASSIGNED: 'Без направления' };
export type Knowledge = { id: string; title: string; keywords: string[]; answer: string };
export type ClinicProgrammeTable = { source: 'OWNER_CONFIRMED_TABLE'; title: string; confirmedAt: string; discountAvailableToAll: boolean; references: string[]; prices: { species: 'CAT' | 'DOG'; programme: 'STANDARD' | 'EXTENDED'; laboratory: 'CLINIC' | 'INVITRO'; regularPrice: number; discountedPrice: number }[] };
export type AvitoSettings = {
  mode: 'MANUAL' | 'SUGGEST' | 'AUTO';
  profiles: { direction: Direction; enabled: boolean; title: string; prompt: string; knowledge: Knowledge[] }[];
  listings: { id: string; title: string; direction: Direction; enabled: boolean; prompt?: string; greeting?: string; intakeQuestion?: string; crmQuery?: string }[];
  administratorSchedule: { opensAt: string; closesAt: string; timezone: string; officeId?: string };
  nightTariff?: { enabled: boolean; startsAt: string; endsAt: string; multiplier: number };
  clinicProgrammeTable?: ClinicProgrammeTable;
  templates: Record<'contact' | 'submitted' | 'medical' | 'urgent' | 'unknown', string> & Partial<Record<'contactName' | 'contactPhone', string>>;
};
export type Installation = { id: string; enabled: boolean; enabledAt: string | null; version: number };
export type AvitoOverview = {
  installation: Installation; entitled: boolean;
  connection: { accountId: string | null; accountName: string | null; checkedAt: string | null; lastSyncAt: string | null; error: string | null; credentialsConfigured: boolean };
  runtime: { ingestionEnabled: boolean; liveSendEnabled: boolean; languageModelConfigured: boolean; localReadOnly?: boolean; pilotRestricted?: boolean };
  referenceData?: { kind: 'LOCAL_SNAPSHOT'; capturedAt: string; services: number; offices: number; vaccineProducts?: number; stale: boolean; inventoryStale?: boolean };
  health: { pending: number; uncertain: number; failedEvents: number };
  settingsVersion: number; mode: AvitoSettings['mode']; profiles: { direction: Direction; title: string; enabled: boolean; listingIds?: string[] }[];
  intake: { recipientRole: 'administrator'; clinicKnowledgeSource: 'CRM' | 'CRM_AND_OWNER_PROGRAMME_TABLE'; doctorSelection: false; automaticBooking: false };
  nightContact?: { phone: string | null; offices: { id: string; name: string; phone: string | null }[] };
  settings?: AvitoSettings; capabilities?: { key: string; title: string; status: string; activation: string }[];
};
export type Outgoing = { id: string; text: string; purpose: string; status: string; error: string | null; createdAt: string; conversationVersion: number };
export type Inquiry = { id: string; requestId: string | null; direction: Direction; contactName: string; phone: string; summary: string; status: string; createdAt: string };
export type ReadyInquiry = Inquiry & { conversationId: string; contactRecordedAt: string; contactMessageId: string; contactBasis: string; conversation: { listingId: string | null; listingTitle: string | null } };
export type AvitoConversation = {
  id: string; externalChatId: string; listingId: string | null; listingTitle: string | null; customerName: string | null; direction: string;
  mode: string; stage: string; needsAttention: boolean; version: number; requestId: string | null; lastMessageAt: string | null;
  intakeCycle: number;
  messages: { id: string; direction: string; type: string; text: string; occurredAt: string }[];
  outbox?: Outgoing[]; inquiries: Inquiry[];
};
export type Call = { id: string; direction: string; occurredAt: string; missed: boolean; note: string | null };
export type Metrics = { conversations: number; calls: number; inquiries: number; confirmedClinicAppointments: number; attention: number; recentCalls: Call[]; note: string };
export type AvitoListing = { id: string; title: string; status: string; url: string | null };
export type AvitoListingInventory = { items: AvitoListing[]; nextPage: number | null; capturedAt: string | null; source: 'AVITO' | 'SAVED' | 'EMPTY'; refreshError: string | null };
export const avitoApi = {
  overview: () => apiRequest<AvitoOverview>('/v1/avito'),
  settings: (version: number, settings: AvitoSettings) => apiRequest('/v1/avito/settings', { method: 'PATCH', body: { version, settings } }),
  revisions: () => apiRequest<{ id: string; version: number; actorId: string | null; createdAt: string }[]>('/v1/avito/settings/revisions'),
  restore: (version: number, expectedVersion: number) => apiRequest('/v1/avito/settings/restore', { method: 'POST', body: { version, expectedVersion } }),
  inquiries: (direction = '', cursor?: string) => apiRequest<{ recipientRole: 'administrator'; items: ReadyInquiry[]; nextCursor: string | null }>(`/v1/avito/inquiries?${new URLSearchParams({ ...(direction ? { direction } : {}), ...(cursor ? { cursor } : {}) })}`),
  conversations: (direction = '', cursor?: string) => apiRequest<{ items: AvitoConversation[]; nextCursor: string | null }>(`/v1/avito/conversations?${new URLSearchParams({ ...(direction ? { direction } : {}), ...(cursor ? { cursor } : {}) })}`),
  conversation: (id: string) => apiRequest<AvitoConversation>(`/v1/avito/conversations/${encodeURIComponent(id)}`),
  mode: (id: string, version: number, mode: string) => apiRequest(`/v1/avito/conversations/${encodeURIComponent(id)}/mode`, { method: 'PATCH', body: { version, mode } }),
  reply: (id: string, body: { clientKey: string; text: string; version: number; draftId?: string }) => apiRequest(`/v1/avito/conversations/${encodeURIComponent(id)}/reply`, { method: 'POST', body }),
  reconcile: (id: string) => apiRequest<{ message?: string }>(`/v1/avito/outbox/${encodeURIComponent(id)}/reconcile`, { method: 'POST' }),
  inquiryStatus: (id: string, status: string) => apiRequest(`/v1/avito/inquiries/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } }),
  newCycle: (id: string, version: number) => apiRequest(`/v1/avito/conversations/${encodeURIComponent(id)}/new-cycle`, { method: 'POST', body: { version } }),
  metrics: (direction = '') => apiRequest<Metrics>(`/v1/avito/metrics${direction ? `?direction=${direction}` : ''}`),
  call: (body: { clientKey: string; direction: Direction; occurredAt: string; missed: boolean; note?: string }) => apiRequest('/v1/avito/calls', { method: 'POST', body }),
  simulate: (body: { listingId: string; text: string; contact?: Record<string, unknown>; at?: string; useAi?: boolean; clientKey?: string }) => apiRequest<{ kind: string; persisted: boolean; modelStatus?: string; decision: { text: string | null; reason: string; direction: string | null; handoff: boolean; createInquiry: boolean; contact: Record<string, unknown>; prompt?: string } }>('/v1/avito/simulate', { method: 'POST', body }),
  check: () => apiRequest('/v1/avito/connection/check', { method: 'POST' }),
  sync: (offset = 0) => apiRequest<{ chats: number; imported: number; nextOffset: number | null }>('/v1/avito/sync', { method: 'POST', body: { offset } }),
  listings: (status = 'all', page = 1) => apiRequest<AvitoListingInventory>(`/v1/avito/listings?${new URLSearchParams({ status, offset: String((page - 1) * 50) })}`),
  savedListings: (page = 1) => apiRequest<AvitoListingInventory>(`/v1/avito/listings/saved?${new URLSearchParams({ status: 'all', offset: String((page - 1) * 50) })}`),
};
