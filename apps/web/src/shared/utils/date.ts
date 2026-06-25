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
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('.') + ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function fromDateTimeText(value: string | undefined) {
  const normalized = parseFlexibleDateTime(value);

  return normalized?.toISOString();
}

export function normalizeDateTimeText(value: string | undefined) {
  const date = parseFlexibleDateTime(value);
  return date ? toDateTimeText(date.toISOString()) : undefined;
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

function parseFlexibleDateTime(value: string | undefined) {
  const source = value?.trim();

  if (!source) {
    return undefined;
  }

  const prepared = replaceRussianMonthNames(source.toLowerCase())
    .replace(/[гг]\.?/g, ' ')
    .replace(/[a-zа-яё]+/gi, ' ')
    .replace(/[^\d]+/g, ' ')
    .trim();
  const parts = prepared.match(/\d+/g)?.map((part) => part.trim()) ?? [];

  if (!parts.length) {
    return parseNativeDateTime(source);
  }

  const now = new Date();
  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  let timeIndex = 0;

  if (parts.length === 1) {
    const compact = parts[0];
    if (compact.length === 8 && compact.startsWith('20')) {
      year = Number(compact.slice(0, 4));
      month = Number(compact.slice(4, 6));
      day = Number(compact.slice(6, 8));
      timeIndex = 1;
    } else if (compact.length === 8) {
      day = Number(compact.slice(0, 2));
      month = Number(compact.slice(2, 4));
      year = expandYear(Number(compact.slice(4, 8)));
      timeIndex = 1;
    } else {
      return parseNativeDateTime(source);
    }
  } else if (parts[0].length === 4) {
    year = Number(parts[0]);
    month = Number(parts[1]);
    day = parts[2] ? Number(parts[2]) : 1;
    timeIndex = parts[2] ? 3 : 2;
  } else if (parts.length >= 3) {
    day = Number(parts[0]);
    month = Number(parts[1]);
    year = expandYear(Number(parts[2]));
    timeIndex = 3;
  } else if (parts[1].length === 4) {
    year = Number(parts[1]);
    month = Number(parts[0]);
    day = 1;
    timeIndex = 2;
  } else {
    day = Number(parts[0]);
    month = Number(parts[1]);
    year = now.getFullYear();
    timeIndex = 2;
  }

  const time = parseTimeParts(parts.slice(timeIndex));
  const date = new Date(year, month - 1, day, time.hours, time.minutes, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== time.hours ||
    date.getMinutes() !== time.minutes
  ) {
    return parseNativeDateTime(source);
  }

  return date;
}

function parseNativeDateTime(value: string) {
  for (const candidate of [value.trim(), value.trim().replace(/\s+/, 'T')]) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return undefined;
}

function replaceRussianMonthNames(value: string) {
  const months: Array<[RegExp, string]> = [
    [/\bянвар[ьяе]?\b|\bянв\b/g, ' 01 '],
    [/\bфеврал[ьяе]?\b|\bфев\b/g, ' 02 '],
    [/\bмарт[ае]?\b|\bмар\b/g, ' 03 '],
    [/\bапрел[ьяе]?\b|\bапр\b/g, ' 04 '],
    [/\bма[йяе]\b/g, ' 05 '],
    [/\bиюн[ьяе]?\b/g, ' 06 '],
    [/\bиюл[ьяе]?\b/g, ' 07 '],
    [/\bавгуст[ае]?\b|\bавг\b/g, ' 08 '],
    [/\bсентябр[ьяе]?\b|\bсен\b|\bсент\b/g, ' 09 '],
    [/\bоктябр[ьяе]?\b|\bокт\b/g, ' 10 '],
    [/\bноябр[ьяе]?\b|\bноя\b/g, ' 11 '],
    [/\bдекабр[ьяе]?\b|\bдек\b/g, ' 12 '],
  ];

  return months.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), value);
}

function expandYear(value: number) {
  return value < 100 ? 2000 + value : value;
}

function parseTimeParts(parts: string[]) {
  if (!parts.length) {
    return { hours: 9, minutes: 0 };
  }

  const first = parts[0];
  if ((first.length === 3 || first.length === 4) && parts.length === 1) {
    const padded = first.padStart(4, '0');
    return { hours: Number(padded.slice(0, 2)), minutes: Number(padded.slice(2, 4)) };
  }

  return {
    hours: Number(first),
    minutes: parts[1] ? Number(parts[1]) : 0,
  };
}
