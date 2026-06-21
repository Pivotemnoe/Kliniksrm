export function normalizeAnimalBirthDateInput(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01-01`;
  }

  const ruDateMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ruDateMatch) {
    const [, day, month, year] = ruDateMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return trimmed;
}

export function formatAnimalBirthDateInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const datePart = value.slice(0, 10);
  if (/^\d{4}-01-01$/.test(datePart)) {
    return datePart.slice(0, 4);
  }

  return datePart;
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
