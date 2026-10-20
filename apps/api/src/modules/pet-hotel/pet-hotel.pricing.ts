import { BadRequestException } from '@nestjs/common';
const day = 86400000;
export function petHotelQuote(startsAt: Date, endsAt: Date, dailyRate: number, walkRate: number, walkCount: number, minimumDays: number) {
  const duration = endsAt.getTime() - startsAt.getTime();
  if (!Number.isFinite(duration) || duration < minimumDays * day || duration > 365 * day) throw new BadRequestException(`Проживание — от ${minimumDays} суток и не более года`);
  if (!Number.isInteger(walkCount) || walkCount < 0 || walkCount > 1000) throw new BadRequestException('Проверьте количество прогулок');
  const billableDays = Math.ceil(duration / day), dailyCents = Math.round(dailyRate * 100), walkCents = Math.round(walkRate * 100);
  if (![dailyCents, walkCents].every(value => Number.isSafeInteger(value) && value >= 0)) throw new BadRequestException('Проверьте стоимость проживания');
  const stayCents = billableDays * dailyCents, walksCents = walkCount * walkCents;
  return { billableDays, dailyRate: (dailyCents / 100).toFixed(2), walkRate: (walkCents / 100).toFixed(2), stayPrice: (stayCents / 100).toFixed(2), walksPrice: (walksCents / 100).toFixed(2), totalPrice: ((stayCents + walksCents) / 100).toFixed(2) };
}
export function petHotelTime(date: Date) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date); }
