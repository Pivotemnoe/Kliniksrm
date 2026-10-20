import { Prisma } from '@prisma/client';

type ReportValue = Prisma.Decimal.Value | null | undefined;

/** Preserve decimal precision while deriving reports; round only when displaying currency. */
export function addReportMoney(...values: ReportValue[]) {
  return sumReportMoney(values);
}

export function sumReportMoney(values: ReportValue[]) {
  return values.reduce<Prisma.Decimal>((sum, value) => sum.plus(value ?? 0), new Prisma.Decimal(0)).toNumber();
}

export function subtractReportMoney(value: ReportValue, ...deductions: ReportValue[]) {
  return deductions.reduce<Prisma.Decimal>((sum, item) => sum.minus(item ?? 0), new Prisma.Decimal(value ?? 0)).toNumber();
}

export function multiplyReportMoney(left: ReportValue, right: ReportValue) {
  return new Prisma.Decimal(left ?? 0).mul(right ?? 0).toNumber();
}
