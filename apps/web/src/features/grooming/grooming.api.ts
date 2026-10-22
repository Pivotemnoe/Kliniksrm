import type { BookingAttribution } from '../../shared/ui/BookingSource';
import { apiRequest } from '../../api/client';
import { groomingLook } from '../../../../owner-gateway/src/grooming/catalog';
export function groomingReference(id: string) {
  const look = groomingLook(id);
  if (!look) return { title: id, url: undefined };
  const base = import.meta.env.VITE_GROOMING_STOREFRONT_URL || 'https://pet.temichevvet.ru';
  const url = new URL(base);
  url.search = new URLSearchParams({ breed: look.breedId, style: look.styleId }).toString(); url.hash = 'looks';
  return { title: `${look.breedName} · ${look.styleName}`, url: url.href };
}
export type Price = { price: string; maximumPrice?: string | null; priceType?: string; priceLabel?: string; catalogData?: { species?: string; category?: string; breedName?: string; unit?: string; supplement?: boolean } };
export type GroomingServiceRow = Price & { id: string; title: string; isActive: boolean; version: number; catalogKey?: string };
export function groomingPrice(value: Price) {
  if (value.priceLabel) return value.priceLabel;
  const n = (v: unknown) => new Intl.NumberFormat('ru-RU').format(Number(v));
  const prefix = value.catalogData?.supplement ? '+ ' : '', suffix = value.catalogData?.unit === 'hour' ? ' / час' : '';
  if(value.priceType === 'QUOTE')return 'Уточним перед записью';
  if(value.priceType === 'UP_TO')return `${prefix}до ${n(value.maximumPrice)} ₽${suffix}`;
  if(value.priceType === 'RANGE')return `${prefix}${n(value.price)}–${n(value.maximumPrice)} ₽${suffix}`;
  if(value.priceType === 'PERCENT')return `${prefix}${n(value.price)}%`;
  return `${prefix}${n(value.price)} ₽${suffix}`;
}
export type Specialist = { id: string; employeeId: string; displayName: string; species: string[]; maxUserId?: string; maxConnected?: boolean; isActive: boolean; version: number };
export type Rule = { id: string; specialistId: string; serviceId: string; locationId: string; workplaceId: string; species: string; size: string; coat: string; durationMinutes: number; bufferMinutes: number; stepMinutes: number; minimumLeadMinutes: number; maximumDaysAhead: number; isActive: boolean; version: number; specialist: Specialist; service: Price & { title: string }; location: { name: string; timezone: string }; workplace: { name: string } };
export type Pet = { id: string; nickname: string; species?: string; breed?: string };
export type Client = { id: string; fullName: string; phone?: string; animals: Pet[] };
export type Booking = Price & { source?: string; attribution?: BookingAttribution | null; id: string; ownerId: string; animalId: string; employeeId: string; ruleId: string; serviceTitle: string; price: string; species: string; size: string; coat: string; startsAt: string; endsAt: string; blockedUntil: string; status: string; version: number; notes: string; looks: string[]; animal: Pet; owner?: { fullName: string; phone?: string }; employee: { fullName: string }; location: { name: string; timezone: string }; workplace: { name: string }; notifications?: Delivery[] };
export type Delivery = { id: string; reservationId: string; event: string; recipientKind: string; status: string; text: string; scheduledAt: string; sentAt?: string; lastError?: string };
export type Settings = { selfBookingEnabled: boolean; minimumCancelMinutes: number; reminderHours: number[]; administratorMaxIds: string[]; testClientMaxId?: string; version: number };
export type Overview = { setup?: { futureWorkPeriods: number; connectedPhones: number }; installation: { enabled: boolean }; entitled: boolean; limited: boolean; canManage: boolean; canSchedule: boolean; specialists: Specialist[]; rules: Rule[]; settings: Settings; resources: { employees: { id: string; fullName: string }[]; locations: { id: string; name: string; address: string; timezone: string; isActive: boolean; version: number }[]; workplaces: { id: string; name: string; locationId: string; isActive: boolean; version: number }[]; services: GroomingServiceRow[] } | null };
export type Shift = { id: string; workplaceId?: string; locationId: string; kind: string; version: number; employeeId: string; employee: { fullName: string }; startsAt: string; endsAt: string; isActive: boolean; comment?: string };
export type Offer = Price & { offerToken: string; startsAt: string; endsAt: string; specialistName: string; serviceTitle: string; price: string; durationMinutes: number; bufferMinutes: number; timezone: string; locationName: string };
const base = '/v1/grooming';
export const groomingApi = {
  overview: () => apiRequest<Overview>(`${base}/overview`),
  bookings: (from?: string, to?: string) => apiRequest<Booking[]>(`${base}/bookings${from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : ''}`),
  booking: (id: string) => apiRequest<Booking>(`${base}/bookings/${encodeURIComponent(id)}`),
  clients: (search = '') => apiRequest<Client[]>(`${base}/clients?search=${encodeURIComponent(search)}`),
  shifts: (from?: string, to?: string) => apiRequest<Shift[]>(`${base}/shifts${from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : ''}`),
  notifications: () => apiRequest<Delivery[]>(`${base}/notifications`),
  options: (body: unknown) => apiRequest<{ offers: Offer[]; notice: string }>(`${base}/options`, { method: 'POST', body }),
  save: (path: string, body: unknown, method = 'POST') => apiRequest(`${base}/${path}`, { method, body }),
};
export const statusLabels: Record<string, string> = { CONFIRMED: 'Записан', ARRIVED: 'Пришёл', IN_PROGRESS: 'На процедуре', COMPLETED: 'Завершён', CANCELLED: 'Отменён', NO_SHOW: 'Не пришёл' };
export const speciesLabels: Record<string, string> = { DOG: 'Собаки', CAT: 'Кошки' };
export const sizeLabels: Record<string, string> = { ANY: 'Любой размер', SMALL: 'Маленький', MEDIUM: 'Средний', LARGE: 'Крупный' };
export const coatLabels: Record<string, string> = { ANY: 'Любая шерсть', SHORT: 'Короткая', LONG: 'Длинная', CURLY: 'Кудрявая', DOUBLE: 'Двойная шерсть' };
export const deliveryLabels: Record<string, string> = { QUEUED: 'В очереди', SENDING: 'Отправляется', SENT: 'MAX принял', FAILED: 'Ошибка', UNKNOWN: 'Нужна сверка', CANCELLED: 'Отменено' };
export const at = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
export const time = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const day = (value: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
