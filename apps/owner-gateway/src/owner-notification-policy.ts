export function notificationLocalTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === type)?.value || '';
  return { dayKey: `${part('year')}-${part('month')}-${part('day')}`, minute: Number(part('hour')) * 60 + Number(part('minute')) };
}
export function nextNotificationTime(now: Date, timezone: string, start: number, end: number) {
  const quiet = (minute: number) => start === end ? false : start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!quiet(notificationLocalTime(now, timezone).minute)) return now;
  // Walk UTC minutes, so DST gaps and repeated hours remain valid real instants.
  for (let i = 0; i <= 1500; i++) {
    const next = new Date(Math.ceil(now.getTime() / 60000) * 60000 + i * 60000);
    if (!quiet(notificationLocalTime(next, timezone).minute)) return next;
  }
  return new Date(now.getTime() + 86400000);
}
