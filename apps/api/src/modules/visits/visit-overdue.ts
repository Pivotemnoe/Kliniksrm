import { Prisma, VisitStatus } from '@prisma/client';

export const VISIT_OVERDUE_THRESHOLD_MINUTES = 60;
export const VISIT_OVERDUE_THRESHOLD_MS = VISIT_OVERDUE_THRESHOLD_MINUTES * 60_000;

export function getVisitOverdueAt(startedAt: Date) {
  return new Date(startedAt.getTime() + VISIT_OVERDUE_THRESHOLD_MS);
}

export function getVisitOverdueCutoff(now = new Date()) {
  return new Date(now.getTime() - VISIT_OVERDUE_THRESHOLD_MS);
}

export function buildOverdueVisitWhere(now = new Date(), employeeId?: string | null): Prisma.VisitWhereInput {
  return {
    status: VisitStatus.IN_PROGRESS,
    hospitalBoxId: null,
    startedAt: { lt: getVisitOverdueCutoff(now) },
    ...(employeeId ? { employeeId } : {}),
  };
}

export function formatVisitOverdueDuration(startedAt: Date, now = new Date()) {
  const totalMinutes = Math.max(Math.floor((now.getTime() - startedAt.getTime()) / 60_000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} ч ${minutes} мин`;
}
