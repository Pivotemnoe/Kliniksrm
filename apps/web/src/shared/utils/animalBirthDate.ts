export function normalizeAnimalBirthDateInput(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return parseAnimalBirthDateInput(trimmed) ?? trimmed;
}

export function isAnimalBirthDateInputValid(value: string | null | undefined) {
  const trimmed = value?.trim();
  return !trimmed || Boolean(parseAnimalBirthDateInput(trimmed));
}

export function formatAnimalBirthDateInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const datePart = value.slice(0, 10);
  if (/^\d{4}-01-01$/.test(datePart)) {
    return datePart.slice(0, 4);
  }

  const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return datePart;
  }

  const [, year, month, day] = dateMatch;
  return `${day}.${month}.${year}`;
}

export function formatAnimalBirthDateDisplay(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  const datePart = value.slice(0, 10);
  if (/^\d{4}-01-01$/.test(datePart)) {
    return datePart.slice(0, 4);
  }

  return new Date(value).toLocaleDateString('ru-RU');
}

export function formatAnimalAge(value: string | null | undefined, referenceDate = new Date()) {
  if (!value) {
    return '—';
  }

  const datePart = value.slice(0, 10);
  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) {
    return '—';
  }

  const now = new Date(referenceDate);
  now.setHours(0, 0, 0, 0);
  birthDate.setHours(0, 0, 0, 0);

  if (birthDate > now) {
    return '—';
  }

  if (/^\d{4}-01-01$/.test(datePart)) {
    const years = now.getFullYear() - birthDate.getFullYear();
    return years > 0 ? formatAgePart(years, 'год', 'года', 'лет') : 'меньше года';
  }

  let years = now.getFullYear() - birthDate.getFullYear();
  let months = now.getMonth() - birthDate.getMonth();
  let days = now.getDate() - birthDate.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years > 0) {
    return [formatAgePart(years, 'год', 'года', 'лет'), months > 0 ? formatAgePart(months, 'месяц', 'месяца', 'месяцев') : null]
      .filter(Boolean)
      .join(' ');
  }

  if (months > 0) {
    return [formatAgePart(months, 'месяц', 'месяца', 'месяцев'), days > 0 ? formatAgePart(days, 'день', 'дня', 'дней') : null]
      .filter(Boolean)
      .join(' ');
  }

  return formatAgePart(days, 'день', 'дня', 'дней');
}

function parseAnimalBirthDateInput(value: string) {
  if (/^\d{4}$/.test(value)) {
    return buildIsoDate(Number(value), 1, 1);
  }

  const parts = value
    .replace(/[,\s/]+/g, '.')
    .replace(/-+/g, '.')
    .split('.')
    .filter(Boolean);

  if (parts.length === 2) {
    const [left, right] = parts;
    if (/^\d{4}$/.test(left) && /^\d{1,2}$/.test(right)) {
      return buildIsoDate(Number(left), Number(right), 1);
    }
    if (/^\d{1,2}$/.test(left) && /^\d{4}$/.test(right)) {
      return buildIsoDate(Number(right), Number(left), 1);
    }
  }

  if (parts.length === 3) {
    const [first, second, third] = parts;
    if (/^\d{4}$/.test(first) && /^\d{1,2}$/.test(second) && /^\d{1,2}$/.test(third)) {
      return buildIsoDate(Number(first), Number(second), Number(third));
    }
    if (/^\d{1,2}$/.test(first) && /^\d{1,2}$/.test(second) && /^\d{4}$/.test(third)) {
      return buildIsoDate(Number(third), Number(second), Number(first));
    }
  }

  return null;
}

function buildIsoDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    year >= 1900 &&
    year <= 2100;

  if (!isValid) {
    return null;
  }

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function formatAgePart(value: number, one: string, few: string, many: string) {
  const lastDigit = value % 10;
  const lastTwoDigits = value % 100;
  const label = lastDigit === 1 && lastTwoDigits !== 11 ? one : lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? few : many;
  return `${value} ${label}`;
}
