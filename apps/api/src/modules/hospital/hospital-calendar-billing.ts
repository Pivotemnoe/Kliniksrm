import { Prisma } from '@prisma/client';

export function hospitalDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

type RateSource = {
  startedAt: Date;
  dailyRateSnapshot: Prisma.Decimal | null;
  hospitalBox: { id: string; name: string; dailyRate: Prisma.Decimal; office: { timezone: string } };
  ratePeriods: Array<{
    hospitalBoxId: string; dailyRate: Prisma.Decimal; startedAt: Date; endedAt: Date | null;
    serviceId: string | null; serviceTitle: string | null; hospitalBox: { name: string };
  }>;
};

// Each occupied local calendar date is charged once. On a transfer date the
// last selected tariff for that date wins; earlier dates retain their snapshot.
export function calculateHospitalStayDayLines(stay: RateSource, asOf: Date) {
  if (asOf < stay.startedAt) return [];
  const timezone = stay.hospitalBox.office.timezone;
  const first = hospitalDateKey(stay.startedAt, timezone);
  const last = hospitalDateKey(asOf, timezone);
  const periods = [...stay.ratePeriods].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  // The first priced tariff also covers earlier dates whose price was never set.
  // Later tariff changes (including an explicit free period) retain their dates.
  const firstPriced = [...periods].reverse().find((period) => period.startedAt <= asOf && period.dailyRate.greaterThan(0));
  const grouped = new Map<string, {
    id: string; kind: 'STAY'; title: string; serviceId: string | null;
    quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; totalAmount: Prisma.Decimal; completedAt: Date;
  }>();
  for (let date = first; date <= last;) {
    let period = periods.find((candidate) => candidate.startedAt <= asOf
      && hospitalDateKey(candidate.startedAt, timezone) <= date
      && (!candidate.endedAt || hospitalDateKey(candidate.endedAt, timezone) >= date));
    if (firstPriced && date < hospitalDateKey(firstPriced.startedAt, timezone)
      && (!period || period.dailyRate.isZero())) period = firstPriced;
    const boxId = period?.hospitalBoxId ?? stay.hospitalBox.id;
    const unitPrice = new Prisma.Decimal(period?.dailyRate ?? stay.dailyRateSnapshot ?? stay.hospitalBox.dailyRate);
    const serviceId = period?.serviceId ?? null;
    const title = period?.serviceTitle ?? `Стационар: ${period?.hospitalBox.name ?? stay.hospitalBox.name}`;
    const key = `${boxId}:${serviceId ?? ''}:${title}:${unitPrice}`;
    const line = grouped.get(key);
    if (line) {
      line.quantity = line.quantity.plus(1);
      line.totalAmount = line.quantity.mul(unitPrice);
      line.completedAt = asOf;
    } else {
      grouped.set(key, { id: `stay:${key}`, kind: 'STAY', title, serviceId,
        quantity: new Prisma.Decimal(1), unitPrice, totalAmount: unitPrice, completedAt: asOf });
    }
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  return [...grouped.values()];
}
