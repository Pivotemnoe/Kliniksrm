import type { Prisma } from '@prisma/client';

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
type Day = { isWorking?: unknown; is24Hours?: unknown; opensAt?: unknown; closesAt?: unknown; breakStart?: unknown; breakEnd?: unknown };

// Missing/malformed hours never inherit UI defaults. Check every occupied minute,
// including overnight hours, breaks and local clock changes.
export function withinOfficeHours(start: Date, end: Date, timezone: string, hours: Prisma.JsonValue | null): boolean {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours) || !(start < end) || end.getTime() - start.getTime() > 240 * 60_000) return false;
  let format: Intl.DateTimeFormat;
  try { format = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  catch { return false; }
  for (let t = Math.floor(start.getTime() / 60_000) * 60_000; t < end.getTime(); t += 60_000) {
    const parts = Object.fromEntries(format.formatToParts(new Date(t)).map(p => [p.type, p.value]));
    const key = parts.weekday.toLowerCase();
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    const current = (hours as Record<string, unknown>)[key];
    const previous = (hours as Record<string, unknown>)[weekdays[(weekdays.indexOf(key) + 6) % 7]];
    if (!dayAllows(current, minute, false) && !dayAllows(previous, minute, true)) return false;
  }
  return true;
}

function dayAllows(value: unknown, minute: number, previous: boolean) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const day = value as Day;
  if (day.isWorking !== true) return false;
  const open = clock(day.opensAt), close = clock(day.closesAt, true);
  let allowed = false;
  if (day.is24Hours === true) allowed = !previous;
  else if (open !== null && close !== null && open !== close) {
    allowed = open < close ? !previous && minute >= open && minute < close
      : previous ? minute < close : minute >= open;
  }
  if (!allowed) return false;
  if (!day.breakStart && !day.breakEnd) return true;
  const breakStart = clock(day.breakStart), breakEnd = clock(day.breakEnd, true);
  if (breakStart === null || breakEnd === null || breakStart === breakEnd) return false;
  const inBreak = breakStart < breakEnd ? minute >= breakStart && minute < breakEnd : minute >= breakStart || minute < breakEnd;
  return !inBreak;
}
function clock(value: unknown, allowMidnight = false): number | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (allowMidnight && hour === 24 && minute === 0) return 1440;
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}
