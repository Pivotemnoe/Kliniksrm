export type VaccinationDueItem = {
  id: string;
  title: string;
  expiresAt: Date | null;
  animal: { id: string };
};

export function resolveVaccinationDues<T extends VaccinationDueItem>(items: T[], now = new Date(), dashboardDate?: string) {
  const currentByAnimalAndVaccine = new Map<string, T>();
  for (const item of items) {
    const key = `${item.animal.id}:${item.title.trim().toLocaleLowerCase('ru-RU')}`;
    if (!currentByAnimalAndVaccine.has(key)) currentByAnimalAndVaccine.set(key, item);
  }

  const selectedDate = dashboardDate ?? moscowDateKey(now);
  const isCurrentMoscowDay = selectedDate === moscowDateKey(now);
  const showToday = !isCurrentMoscowDay || moscowMinuteOfDay(now) >= 8 * 60;
  const current = [...currentByAnimalAndVaccine.values()];

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
