export function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

export function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '—';
}

export function toDatetimeLocal(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function fromDatetimeLocal(value: string | undefined) {
  return value ? new Date(value).toISOString() : undefined;
}

export function toDateTimeText(value: string | null | undefined) {
  return toDatetimeLocal(value).replace('T', ' ');
}

export function fromDateTimeText(value: string | undefined) {
  const normalized = value?.trim().replace(' ', 'T');

  if (!normalized) {
    return undefined;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function getDayBounds(date: string) {
  if (!date) {
    return {};
  }

  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);

  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
  };
}
