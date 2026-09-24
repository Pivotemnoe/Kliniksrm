export type VaccinationDueItem = {
  id: string;
  title: string;
  expiresAt: Date | null;
  animal: { id: string };
  vaccinatedAt?: Date | null;
  createdAt?: Date;
  revaccinationTask?: { status: string } | null;
};

export function resolveVaccinationDues<T extends VaccinationDueItem>(items: T[], now = new Date(), dashboardDate?: string) {
  const selectedDate = dashboardDate ?? moscowDateKey(now);
  const isCurrentMoscowDay = selectedDate === moscowDateKey(now);
  const showToday = !isCurrentMoscowDay || moscowMinuteOfDay(now) >= 8 * 60;
  const current = selectCurrentVaccinations(items).filter(item => !item.revaccinationTask || item.revaccinationTask.status === 'OPEN');

  return {
    today: showToday
      ? current
          .filter((item) => item.expiresAt && moscowDateKey(item.expiresAt) === selectedDate)
          .sort((left, right) => left.title.localeCompare(right.title, 'ru-RU'))
      : [],
    overdue: current
      .filter((item) => item.expiresAt && moscowDateKey(item.expiresAt) < selectedDate)
      .sort((left, right) => Number(right.expiresAt) - Number(left.expiresAt)),
    todayAvailableAt: new Date(`${selectedDate}T08:00:00+03:00`),
  };
}

export function moscowDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function moscowMinuteOfDay(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

// One actionable reminder per animal; an overdue vaccine makes the whole task overdue.
export function groupVaccinationDues<T extends VaccinationDueItem>(dues: { today: T[]; overdue: T[] }) {
  const groups = new Map<string, { animal: T['animal']; vaccines: T[]; overdue: boolean }>();
  for (const [rows, overdue] of [[dues.today, false], [dues.overdue, true]] as const) {
    for (const vaccine of rows) {
      const group = groups.get(vaccine.animal.id) ?? { animal: vaccine.animal, vaccines: [] as T[], overdue: false };
      group.vaccines.push(vaccine);
      group.overdue ||= overdue;
      groups.set(vaccine.animal.id, group);
    }
  }
  return [...groups.values()].map(group => ({ ...group,
    vaccines: group.vaccines.sort((a, b) => Number(a.expiresAt) - Number(b.expiresAt) || a.id.localeCompare(b.id)),
  }));
}

// Packaging text is not a different vaccine. Keep product/valency numbers otherwise:
// arbitrary fuzzy matching could hide a genuinely different vaccination.
export function vaccinationIdentity(title: string) {
  const key = title.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/\(?\s*\d+(?:[.,]\d+)?\s*доз(?:а|ы|у)?\s*\)?/gu, '')
    .replace(/[\s()]+/gu, '').trim();
  return key === 'мультифел' ? 'мультифел4' : key;
}

export function selectCurrentVaccinations<T extends VaccinationDueItem>(items: T[]): T[] {
  const byVaccine = new Map<string, T>();
  const date = (item: T) => Number(item.vaccinatedAt ?? item.createdAt ?? item.expiresAt ?? 0);
  for (const item of items) {
    const key = `${item.animal.id}:${vaccinationIdentity(item.title)}`;
    const previous = byVaccine.get(key);
    if (!previous || date(item) > date(previous)
      || (date(item) === date(previous) && Number(item.createdAt ?? 0) > Number(previous.createdAt ?? 0))) {
      byVaccine.set(key, item);
    }
  }
  return [...byVaccine.values()];
}
