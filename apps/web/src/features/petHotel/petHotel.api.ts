import { apiRequest } from '../../api/client';
export const hotelStatuses: Record<string, string> = { RESERVED: 'Бронь', IN_HOUSE: 'Проживает', CHECKED_OUT: 'Выехал', CANCELLED: 'Отменена', NO_SHOW: 'Не приехал' };
export const hotelSpecies: Record<string, string> = { CAT: 'Кошки', DOG: 'Собаки' };
export type HotelRoom = { id: string; code: string; name: string; species: string; isActive: boolean; sortOrder: number; version: number; dailyRate: string | null; quote?: HotelQuote };
export type HotelSettings = { dailyRate: string; walkRate: string; minimumDays: number; maximumDogWeightKg: string; checkInFrom: string; checkInTo: string; siteUrl: string; selfBookingEnabled: boolean; administratorMaxIds: string[]; reminderHours: number[]; version: number };
export type HotelPet = { id: string; nickname: string; species: string | null; breed: string | null };
export type HotelClient = { id: string; fullName: string; phone: string | null; animals: HotelPet[] };
export type HotelBooking = { id: string; ownerId: string; animalId: string; roomId: string; owner: { id: string; fullName: string; phone: string | null }; animal: HotelPet; room: HotelRoom; startsAt: string; endsAt: string; actualCheckInAt: string | null; actualCheckOutAt: string | null; status: string; version: number; species: string; weightKg: string | null; billableDays: number; walkCount: number; dailyRate: string; walkRate: string; totalPrice: string; notes: string };
export type HotelOverview = { installation: { enabled: boolean }; limited: boolean; canManage: boolean; canOperate: boolean; mode: string; settings: HotelSettings; rooms: HotelRoom[]; stats: { catRooms: number; dogRooms: number; inHouse: number; upcoming: number } };
export type HotelQuote = { billableDays: number; dailyRate: string; walkRate: string; stayPrice: string; walksPrice: string; totalPrice: string };
export type HotelAvailability = { rooms: HotelRoom[]; species: string; quote: HotelQuote };
export type HotelNotification = { id: string; reservationId: string; event: string; recipientKind: string; status: string; scheduledAt: string; sentAt: string | null; lastError: string | null };
export const hotelDay = (value: string | Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const hotelTime = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const hotelAt = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const hotelMoney = (value: string | number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(Number(value));
export const hotelApi = {
  notifications: () => apiRequest<HotelNotification[]>('/v1/pet-hotel/notifications'),
  overview: () => apiRequest<HotelOverview>('/v1/pet-hotel/overview'),
  bookings: (from: string, to: string) => apiRequest<{ items: HotelBooking[]; truncated: boolean }>(`/v1/pet-hotel/bookings?${new URLSearchParams({ from, to })}`),
  booking: (id: string) => apiRequest<HotelBooking>(`/v1/pet-hotel/bookings/${encodeURIComponent(id)}`),
  clients: (search: string) => apiRequest<HotelClient[]>(`/v1/pet-hotel/clients?${new URLSearchParams({ search })}`),
  availability: (input: Record<string, unknown>) => apiRequest<HotelAvailability>('/v1/pet-hotel/availability', { method: 'POST', body: input }),
  save: <T = unknown,>(path: string, body: unknown, method = 'POST') => apiRequest<T>(`/v1/pet-hotel/${path}`, { method, body }),
};
