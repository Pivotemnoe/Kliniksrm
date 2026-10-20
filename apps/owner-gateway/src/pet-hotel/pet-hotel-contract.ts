import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';

export const hotelDay = 86400000;
export function hotelText(value: unknown, max = 120) {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f]/.test(value)) throw new BadRequestException('Некорректные данные зоогостиницы');
  return value;
}
export function hotelInstant(value: unknown) {
  const text = hotelText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text) || !isISO8601(text, { strict: true }) || !Number.isFinite(Date.parse(text))) throw new BadRequestException('Выберите корректные даты и время');
  return new Date(text).toISOString();
}
export function hotelMoney(value: unknown) {
  if (!['string', 'number'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) throw new BadRequestException('Некорректный тариф номера');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000) throw new BadRequestException('Некорректный тариф номера');
  return (cents / 100).toFixed(2);
}
function int(value: unknown, min: number, max: number) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new BadRequestException('Некорректные условия гостиницы');
  return Number(value);
}
export function hotelSnapshot(payload: Record<string, any>, now = Date.now()) {
  if (payload.schemaVersion !== 1 || JSON.stringify(payload).length > 1500000 || !Array.isArray(payload.rooms) || payload.rooms.length > 1000 || !Array.isArray(payload.busy) || payload.busy.length > 5000) throw new BadRequestException('Некорректный снимок гостиницы');
  const capturedAt = hotelInstant(payload.capturedAt);
  if (Math.abs(now - Date.parse(capturedAt)) > 120000) throw new BadRequestException('Время источника гостиницы отличается');
  const s = payload.settings || {};
  const settings = { dailyRate: hotelMoney(s.dailyRate), walkRate: hotelMoney(s.walkRate), minimumDays: int(s.minimumDays, 1, 365), maximumDogWeightKg: Number(s.maximumDogWeightKg), checkInFrom: hotelText(s.checkInFrom, 5), checkInTo: hotelText(s.checkInTo, 5), timezone: 'Europe/Moscow' };
  if (!Number.isFinite(settings.maximumDogWeightKg) || settings.maximumDogWeightKg <= 0 || settings.maximumDogWeightKg > 999 || ![settings.checkInFrom, settings.checkInTo].every(t => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) || settings.checkInFrom > settings.checkInTo) throw new BadRequestException('Некорректные условия гостиницы');
  const rooms = payload.rooms.map((r: any) => {
    if (!['CAT', 'DOG'].includes(r.species)) throw new BadRequestException('Некорректный вид питомца');
    return { id: hotelText(r.id, 100), code: hotelText(r.code, 30), name: hotelText(r.name), species: r.species as 'CAT' | 'DOG', dailyRate: hotelMoney(r.dailyRate ?? settings.dailyRate), isActive: r.isActive === true, version: int(r.version, 1, 2147483647), sortOrder: int(r.sortOrder ?? 0, 0, 10000) };
  });
  if (new Set(rooms.map((r: any) => r.id)).size !== rooms.length) throw new BadRequestException('Повторяющиеся номера');
  const busy = payload.busy.map((b: any) => {
    if (!['CONFIRMED', 'IN_HOUSE'].includes(b.status)) throw new BadRequestException('Некорректный статус размещения');
    const startsAt = hotelInstant(b.startsAt), endsAt = hotelInstant(b.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Некорректное время размещения');
    return { roomId: hotelText(b.roomId, 100), startsAt, endsAt, status: b.status as string };
  });
  return { schemaVersion: 1, enabled: payload.enabled === true, selfBookingEnabled: payload.selfBookingEnabled === true, testMode: payload.testMode === true, capturedAt, settings, rooms, busy };
}
export type HotelSnapshot = ReturnType<typeof hotelSnapshot>;
export function hotelSelection(input: Record<string, any>, settings: HotelSnapshot['settings'], now = Date.now()) {
  if (!['CAT', 'DOG'].includes(input.species)) throw new BadRequestException('Выберите кошку или собаку');
  const startsAt = hotelInstant(input.startsAt), endsAt = hotelInstant(input.endsAt), duration = Date.parse(endsAt) - Date.parse(startsAt);
  if (Date.parse(startsAt) <= now || Date.parse(startsAt) > now + 365 * hotelDay || duration < settings.minimumDays * hotelDay || duration > 365 * hotelDay) throw new BadRequestException(`Проживание — от ${settings.minimumDays} суток, заезд в течение года`);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(startsAt));
  if (time < settings.checkInFrom || time > settings.checkInTo) throw new BadRequestException(`Заселение ${settings.checkInFrom}–${settings.checkInTo}`);
  const weightKg = input.species === 'DOG' ? Number(input.weightKg) : undefined;
  if (input.species === 'DOG' && (!Number.isFinite(weightKg) || weightKg! <= 0 || weightKg! > settings.maximumDogWeightKg)) throw new BadRequestException(`Принимаем собак до ${settings.maximumDogWeightKg} кг`);
  const walkCount = Number(input.walkCount ?? 0);
  int(walkCount, 0, 1000);
  if (input.species === 'CAT' && walkCount !== 0) throw new BadRequestException('Выгул доступен для собак');
  return { species: input.species as 'CAT' | 'DOG', startsAt, endsAt, ...(weightKg === undefined ? {} : { weightKg }), walkCount };
}
export function hotelRoomFree(data: HotelSnapshot, roomId: string, selection: { startsAt: string; endsAt: string }, now = Date.now()) {
  return !data.busy.some(b => b.roomId === roomId && (b.status === 'IN_HOUSE' && Date.parse(b.endsAt) <= now || b.startsAt < selection.endsAt && b.endsAt > selection.startsAt));
}
export function hotelQuote(dailyRate: string, walkRate: string, selection: { startsAt: string; endsAt: string; walkCount: number }) {
  const billableDays = Math.ceil((Date.parse(selection.endsAt) - Date.parse(selection.startsAt)) / hotelDay);
  const stay = billableDays * Math.round(Number(dailyRate) * 100), walks = selection.walkCount * Math.round(Number(walkRate) * 100);
  return { billableDays, dailyRate, walkRate, stayPrice: (stay / 100).toFixed(2), walksPrice: (walks / 100).toFixed(2), totalPrice: ((stay + walks) / 100).toFixed(2) };
}
