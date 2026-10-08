export function intakeKind(title: string): 'INITIAL' | 'FOLLOWUP' | null {
  const value = title.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  return /^первичн\S*\s+прием(?:\s+врача)?$/.test(value) ? 'INITIAL' : /^повторн\S*\s+прием(?:\s+врача)?$/.test(value) ? 'FOLLOWUP' : null;
}
export function previousMonth(at: Date, timezone = 'UTC') {
  const offset = (value: Date) => {
    const name = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(value).find(p => p.type === 'timeZoneName')!.value;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
    return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  };
  // Subtract the month on the clinic's clock: Moscow midnight can still be
  // the previous UTC month. Convert back using the target month's offset.
  const result = new Date(at.getTime() + offset(at)), date = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() - 1);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date, last));
  let instant = new Date(result.getTime() - offset(result));
  for (let i = 0; i < 3; i++) instant = new Date(result.getTime() - offset(instant));
  return instant;
}
export function ordinaryIntakeQuery(query?: string) {
  const value = (query || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  return !value || /^(?:прием|осмотр|на прием|к врачу|первичн\S*(?:\s+прием)?(?:\s+врача)?)$/.test(value);
}
