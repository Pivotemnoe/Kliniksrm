type Service = { id: string; title: string };
export function selectBookingService(services: Service[], query?: string, id?: string) {
  if (id) return { state: services.some(s => s.id === id) ? 'MATCHED' : 'UNAVAILABLE', services: services.filter(s => s.id === id) };
  if (!query?.trim()) return { state: 'ANY', services };
  const exact = services.filter(s => normalize(s.title) === normalize(query));
  const words = tokens(query).filter(w => !['кошк', 'соба'].includes(w) || services.some(s => tokens(s.title).includes(w)));
  const matches = exact.length ? exact : words.length ? services.filter(s => words.every(w => tokens(s.title).includes(w))) : [];
  return { state: matches.length === 1 ? 'MATCHED' : matches.length ? 'CHOOSE' : 'UNAVAILABLE', services: matches.length ? matches : services };
}
function normalize(value: string) { return value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim(); }
function tokens(value: string) {
  return normalize(value).split(' ').filter(w => w.length > 2 && !/^(?:для|питомца|нужен|нужна|нужно|хочу|сделать|наша|нашего)$/.test(w) && !/^(?:запис|здоров|вымышлен|планов)/.test(w))
    .map(w => /^(?:кош|кот)/.test(w) ? 'кошк' : /^(?:собак|щен)/.test(w) ? 'соба' : /^(?:вакцин|привив)/.test(w) ? 'вакцин' : /^прием/.test(w) ? 'прием' : w.slice(0, Math.min(w.length, 5)));
}
export type BookingDateSelection = { state: 'ANY' | 'MATCHED' | 'CLARIFY'; date?: string; minMinute?: number; maxMinute?: number };
// Calendar intent is interpreted by clinic time, independently for each office.
// Unsupported/ambiguous phrases request an explicit date rather than guessing.
export function selectBookingDate(text: string | undefined, exactDate: string | undefined, now: Date, timezone: string): BookingDateSelection {
  const today = localCalendar(now, timezone).date;
  let date: string | undefined;
  let rest = (text || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim().replace(/[.,!?]+$/, '');
  if (exactDate) { date = validDate(exactDate) ? exactDate : undefined; rest = ''; if (!date) return { state: 'CLARIFY' }; }
  else if (!rest) return { state: 'ANY' };
  else {
    rest = rest.replace(/^(?:на|в|к)\s+/, '');
    const relative = /^(послезавтра|завтра|сегодня)(?:\s+|$)/.exec(rest);
    const numeric = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}(?:\.\d{4})?)(?:\s+|$)/.exec(rest);
    const named = /^(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4})(?:\s+года)?)?(?:\s+|$)/.exec(rest);
    const weekday = /^(?:(?:ближайш(?:ий|ую)|эту|этот)\s+)?(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?:\s+|$)/.exec(rest);
    if (relative) date = addDays(today, relative[1] === 'сегодня' ? 0 : relative[1] === 'завтра' ? 1 : 2);
    else if (numeric) {
      const parts = numeric[1].split('.');
      date = parts.length > 1 ? `${parts[2] || today.slice(0, 4)}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}` : numeric[1];
    } else if (named) {
      const month = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'].indexOf(named[2]) + 1;
      date = `${named[3] || today.slice(0, 4)}-${String(month).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
    } else if (weekday) {
      const target = ['воскресенье','понедельник','вторник','среду','четверг','пятницу','субботу'].indexOf(weekday[1]);
      date = addDays(today, (target - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7);
    }
    const match = relative || numeric || named || weekday;
    if (!match || !date) return { state: 'CLARIFY' };
    rest = rest.slice(match[0].length).trim();
  }
  if (!date || !validDate(date) || date < today || date > addDays(today, 60)) return { state: 'CLARIFY' };
  if (!rest) return { state: 'MATCHED', date };
  const periods: Record<string, [number, number]> = { утром: [0, 720], днем: [720, 1080], вечером: [1080, 1440] };
  if (periods[rest]) return { state: 'MATCHED', date, minMinute: periods[rest][0], maxMinute: periods[rest][1] };
  const clock = /^(в|после|до)\s+(\d{1,2})(?::(\d{2}))?(?:\s+час(?:а|ов)?)?$/.exec(rest);
  if (!clock || Number(clock[2]) > 23 || Number(clock[3] || 0) > 59 || (clock[3] === undefined && Number(clock[2]) < 8)) return { state: 'CLARIFY' };
  const minute = Number(clock[2]) * 60 + Number(clock[3] || 0);
  return { state: 'MATCHED', date, minMinute: clock[1] === 'до' ? 0 : minute, maxMinute: clock[1] === 'после' ? 1440 : clock[1] === 'до' ? minute : minute + 1 };
}
export function matchesBookingDate(start: Date, timezone: string, selection: BookingDateSelection) {
  if (selection.state === 'CLARIFY') return false;
  if (selection.state === 'ANY') return true;
  const local = localCalendar(start, timezone);
  return local.date === selection.date && local.minute >= (selection.minMinute ?? 0) && local.minute < (selection.maxMinute ?? 1440);
}
export function localCalendar(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}
function validDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date; }
function addDays(date: string, days: number) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10); }
