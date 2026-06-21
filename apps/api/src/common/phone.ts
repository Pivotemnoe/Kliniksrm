import { BadRequestException } from '@nestjs/common';

export function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizePersonNameKey(value: string) {
  return normalizeDisplayName(value).toLocaleLowerCase('ru-RU');
}

export function normalizePhoneForLookup(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  let normalized = digits;

  if (digits.length === 10) {
    normalized = `7${digits}`;
  } else if (digits.length === 11 && digits.startsWith('8')) {
    normalized = `7${digits.slice(1)}`;
  }

  if (!/^7\d{10}$/.test(normalized)) {
    throw new BadRequestException('Телефон должен быть российским номером в формате +7 XXX XXX XX XX');
  }

  return normalized;
}

export function formatNormalizedRussianPhone(value?: string | null) {
  if (!value) {
    return null;
  }

  return `+7 ${value.slice(1, 4)} ${value.slice(4, 7)} ${value.slice(7, 9)} ${value.slice(9, 11)}`;
}

export function normalizeRussianPhone(value?: string | null) {
  const normalized = normalizePhoneForLookup(value);
  return formatNormalizedRussianPhone(normalized);
}

export function normalizePhoneSearch(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }

  return digits;
}
