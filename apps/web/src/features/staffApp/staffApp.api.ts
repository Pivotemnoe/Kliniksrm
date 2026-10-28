import { apiRequest } from '../../api/client';
export const staffAppBase = '/v1/staff-app';
export type MobileSettings = { enabled: boolean; clinicBooking: boolean; groomingBooking: boolean; notifications: boolean };
export type MobileProfile = { settings: MobileSettings; kind: 'CLINIC' | 'GROOMING'; canBook: boolean; canManage: boolean; canViewClinic: boolean; notificationMode: string };
export type MobileEmployee = { id: string; fullName: string; position: string; accountScope: string; updatedAt: string; settings: MobileSettings; canClinicBook: boolean; canGroomingBook: boolean };
export type MobileBooking = { id: string; ownerId: string; animalId: string; startsAt: string; endsAt?: string; status: string; comment?: string; notes?: string; serviceTitle?: string; version?: number; species?: string; size?: string; coat?: string; rule?: { serviceId: string }; animal: { nickname: string; species?: string; breed?: string }; owner: { fullName: string; phone?: string }; employee?: { fullName: string }; room?: { name: string }; location?: { name: string } };
export type MobileInbox = { items: { id: string; title: string; body: string; readAt?: string; createdAt: string; reservationId?: string; supersededAt?: string }[]; unread: number };
export const mobileApi = {
  profile: () => apiRequest<MobileProfile>(`${staffAppBase}/me`),
  agenda: (from: string, to: string, scope?: string) => apiRequest<{ kind: string; items: MobileBooking[]; shifts: { id: string; startsAt: string; endsAt: string }[] }>(`${staffAppBase}/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`),
  inbox: () => apiRequest<MobileInbox>(`${staffAppBase}/inbox`),
  settings: () => apiRequest<MobileEmployee[]>(`${staffAppBase}/settings`),
  saveSettings: (employee: MobileEmployee, settings: MobileSettings) => apiRequest(`${staffAppBase}/settings/${encodeURIComponent(employee.id)}`, { method: 'PATCH', body: { ...settings, updatedAt: employee.updatedAt } }),
};
