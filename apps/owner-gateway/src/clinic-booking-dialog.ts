export type ClinicBookingDraft = { revision: number; serviceQuery: string | null; preferredTimeText: string | null };
export function bookingDraft(value: unknown): ClinicBookingDraft | null {
  const v = value as ClinicBookingDraft | null;
  return v && Number.isSafeInteger(v.revision) && v.revision > 0
    && [v.serviceQuery, v.preferredTimeText].every(x => x === null || typeof x === 'string' && x.length <= 256) ? v : null;
}
export function nextBookingDraft(previous: unknown, revision: number, source: string, result: { serviceQuery: string | null; preferredTimeText: string | null }): ClinicBookingDraft {
  const prior = bookingDraft(previous);
  return { revision, serviceQuery: literalFragment(source, result.serviceQuery) ?? prior?.serviceQuery ?? null,
    preferredTimeText: literalFragment(source, result.preferredTimeText) ?? prior?.preferredTimeText ?? null };
}
function literalFragment(source: string, value: string | null) {
  if (!value?.trim() || value.length > 256) return null;
  return source.toLocaleLowerCase('ru').includes(value.trim().toLocaleLowerCase('ru')) ? value.trim() : null;
}
export function fallbackBookingHints(text: string) {
  const service = /(?:первичн\S*\s+при[её]м|повторн\S*\s+при[её]м|вакцин\S*|привив\S*|УЗИ|осмотр|при[её]м)/i.exec(text)?.[0] || null;
  const date = /(?:послезавтра|завтра|сегодня|\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}(?:\.\d{4})?|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?|(?:в\s+)?(?:понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье))(?:\s+(?:утром|дн[её]м|вечером|(?:в|после|до)\s+\d{1,2}(?::\d{2})?))?/i.exec(text)?.[0] || null;
  return { serviceQuery: service, preferredTimeText: date };
}
export function autoBookingReply() {
  return { human: false, intake: true, text: 'Подберём услугу и удобное время. Варианты появятся ниже. Если услуга или дата неоднозначны, уточним их перед записью.' };
}
