import { BadRequestException } from '@nestjs/common';

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function resolveReportRange(input: { from?: string; to?: string }, now = new Date()) {
  const offsetMinutes = getClinicOffsetMinutes();
  const localNow = new Date(now.getTime() + offsetMinutes * 60_000);
  const defaultFrom = formatDateParts(localNow.getUTCFullYear(), localNow.getUTCMonth() + 1, 1);
  const defaultTo = formatDateParts(localNow.getUTCFullYear(), localNow.getUTCMonth() + 1, localNow.getUTCDate());
  const from = input.from ?? defaultFrom;
  const to = input.to ?? defaultTo;
  const start = parseClinicDate(from, offsetMinutes);
  const endStart = parseClinicDate(to, offsetMinutes);
  const end = new Date(endStart.getTime() + 86_400_000 - 1);

  if (start > end) {
    throw new BadRequestException('Дата начала отчёта должна быть не позже даты окончания');
  }

  if (end.getTime() - start.getTime() > 5 * 366 * 86_400_000) {
    throw new BadRequestException('Для одного отчёта выберите период не более пяти лет');
  }

  return { from, to, start, end, offsetMinutes };
}

export function clinicDateKey(date: Date, offsetMinutes = getClinicOffsetMinutes()) {
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  return formatDateParts(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
}

function parseClinicDate(value: string, offsetMinutes: number) {
  const match = datePattern.exec(value);
  if (!match) {
    throw new BadRequestException('Дата отчёта должна быть в формате ГГГГ-ММ-ДД');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day) - offsetMinutes * 60_000);
  const localCheck = new Date(utc.getTime() + offsetMinutes * 60_000);
  if (
    localCheck.getUTCFullYear() !== year ||
    localCheck.getUTCMonth() !== month - 1 ||
    localCheck.getUTCDate() !== day
  ) {
    throw new BadRequestException('Указана некорректная дата отчёта');
  }

  return utc;
}

function getClinicOffsetMinutes() {
  const parsed = Number(process.env.CLINIC_UTC_OFFSET_MINUTES ?? 180);
  return Number.isFinite(parsed) ? parsed : 180;
}

function formatDateParts(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
