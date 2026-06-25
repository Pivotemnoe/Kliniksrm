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
