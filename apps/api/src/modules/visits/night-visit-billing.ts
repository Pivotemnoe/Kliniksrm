import { clinicLocalParts, clinicLocalInstant } from '../../common/clinic-calendar';

type Visit = { status: string; employeeId: string | null; completedAt: Date | null };
type Actor = { id: string; roles: string[] };

// Calendar arithmetic is performed in the branch timezone, never in the server
// or browser timezone. Only visits completed during this night are eligible.
export function nightVisitBillingDeadline(visit: Visit, actor: Actor, now = new Date(), timezone = 'Europe/Moscow'): Date | null {
  if (visit.status !== 'COMPLETED' || !visit.completedAt || visit.employeeId !== actor.id || !actor.roles.includes('doctor')) return null;
  const parts = clinicLocalParts(now, timezone);
  const minute = parts.hour * 60 + parts.minute;
  if (minute >= 540 && minute < 1170) return null;
  const date = Date.UTC(parts.year, parts.month - 1, parts.day);
  const startDate = new Date(date - (minute < 540 ? 86400000 : 0));
  const endDate = new Date(startDate.getTime() + 86400000);
  const start = clinicLocalInstant(startDate, 19, 30, timezone);
  const end = clinicLocalInstant(endDate, 9, 0, timezone);
  return visit.completedAt >= start && visit.completedAt <= now && now < end ? end : null;
}
