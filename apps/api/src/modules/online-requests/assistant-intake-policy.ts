export function intakeKind(title: string): 'INITIAL' | 'FOLLOWUP' | null {
  const value = title.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  return /^первичн\S*\s+прием(?:\s+врача)?$/.test(value) ? 'INITIAL' : /^повторн\S*\s+прием(?:\s+врача)?$/.test(value) ? 'FOLLOWUP' : null;
}
export function previousMonth(at: Date) {
  const result = new Date(at), date = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() - 1);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date, last));
  return result;
}
export function ordinaryIntakeQuery(query?: string) {
  const value = (query || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  return !value || /^(?:прием|осмотр|на прием|к врачу|первичн\S*(?:\s+прием)?(?:\s+врача)?)$/.test(value);
}
