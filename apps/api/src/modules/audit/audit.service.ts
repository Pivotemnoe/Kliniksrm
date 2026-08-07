import { Injectable } from '@nestjs/common';
import { Prisma, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditExportQueryDto } from './dto/audit-export-query.dto';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';
import { AuditVisitControlQueryDto } from './dto/audit-visit-control-query.dto';
import { clinicDateKey, resolveReportRange } from '../reports/report-range';
import { VISIT_OVERDUE_THRESHOLD_MINUTES } from '../visits/visit-overdue';

type AuditInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

const workGapLimitMs = 20 * 60 * 1000;
const defaultExportLimit = 5000;
const maxExportLimit = 20000;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  async listRecent() {
    return this.prisma.auditLog.findMany({
      where: {
        action: { not: 'ui.heartbeat' },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            fullName: true,
            position: true,
            status: true,
          },
        },
      },
      take: 300,
    });
  }

  async getVisitControl(query: AuditVisitControlQueryDto) {
    const range = resolveReportRange(query);
    return this.buildVisitControl({
      start: range.start,
      end: range.end,
      from: range.from,
      to: range.to,
      offsetMinutes: range.offsetMinutes,
      employeeId: query.employeeId,
    });
  }

  async logActivity(actorId: string, dto: CreateActivityLogDto, ipAddress?: string | null, userAgent?: string | null) {
    const action = `ui.${dto.type}`;
    const metadata: Prisma.InputJsonObject = {
      path: dto.path ?? null,
      title: dto.title ?? null,
      userAgent: userAgent ?? null,
      details: toInputJsonValue(dto.details),
    };

    return this.log({
      actorId,
      action,
      entityType: 'UserActivity',
      metadata,
      ipAddress,
    });
  }

  async exportReport(query: AuditExportQueryDto) {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : now;
    const limit = clampLimit(query.limit);
    const events = await this.prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        actor: {
          select: {
            id: true,
            fullName: true,
            position: true,
            status: true,
          },
        },
      },
      take: limit,
    });

    const visitControl = await this.buildVisitControl({
      start: from,
      end: to,
      from: clinicDateKey(from),
      to: clinicDateKey(to),
      offsetMinutes: getClinicOffsetMinutes(),
    });

    return {
      generatedAt: now.toISOString(),
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      settings: {
        estimatedWorkGapMinutes: workGapLimitMs / 60000,
        limit,
      },
      summary: buildSummary(events),
      visitControl,
      events: events.map((event) => ({
        id: event.id,
        at: event.createdAt.toISOString(),
        actorId: event.actorId,
        actorName: event.actor?.fullName ?? null,
        actorPosition: event.actor?.position ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        ipAddress: event.ipAddress,
        metadata: event.metadata,
      })),
    };
  }

  private async buildVisitControl(input: {
    start: Date;
    end: Date;
    from: string;
    to: string;
    offsetMinutes: number;
    employeeId?: string;
  }) {
    const dateWhere = { gte: input.start, lte: input.end };
    const [completedVisits, overdueAlerts, issuedNotifications] = await Promise.all([
      this.prisma.visit.findMany({
        where: {
          status: VisitStatus.COMPLETED,
          completedAt: dateWhere,
          hospitalBoxId: null,
          ...(input.employeeId ? { employeeId: input.employeeId } : {}),
        },
        select: { id: true, completedAt: true },
      }),
      this.prisma.visitOverdueAlert.findMany({
        where: {
          overdueAt: dateWhere,
          ...(input.employeeId ? { employeeId: input.employeeId } : {}),
        },
        select: { id: true, visitId: true, overdueAt: true },
      }),
      this.prisma.visitOverdueAlert.findMany({
        where: {
          createdAt: dateWhere,
          ...(input.employeeId ? { employeeId: input.employeeId } : {}),
        },
        select: { id: true, visitId: true, createdAt: true },
      }),
    ]);

    const rows = seedVisitControlDays(input.from, input.to);
    for (const visit of completedVisits) {
      if (!visit.completedAt) continue;
      getVisitControlRow(rows, clinicDateKey(visit.completedAt, input.offsetMinutes)).completedVisits += 1;
    }
    for (const alert of overdueAlerts) {
      getVisitControlRow(rows, clinicDateKey(alert.overdueAt, input.offsetMinutes)).overdueVisits += 1;
    }
    for (const notification of issuedNotifications) {
      getVisitControlRow(rows, clinicDateKey(notification.createdAt, input.offsetMinutes)).notificationsIssued += 1;
    }

    return {
      range: { from: input.from, to: input.to },
      thresholdMinutes: VISIT_OVERDUE_THRESHOLD_MINUTES,
      totals: {
        completedVisits: completedVisits.length,
        overdueVisits: overdueAlerts.length,
        notificationsIssued: issuedNotifications.length,
      },
      daily: [...rows.values()].sort((left, right) => left.date.localeCompare(right.date)),
    };
  }
}

function seedVisitControlDays(from: string, to: string) {
  const rows = new Map<string, { date: string; completedVisits: number; overdueVisits: number; notificationsIssued: number }>();
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    rows.set(key, visitControlRow(key));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function getVisitControlRow(
  rows: Map<string, { date: string; completedVisits: number; overdueVisits: number; notificationsIssued: number }>,
  date: string,
) {
  const row = rows.get(date) ?? visitControlRow(date);
  rows.set(date, row);
  return row;
}

function visitControlRow(date: string) {
  return { date, completedVisits: 0, overdueVisits: 0, notificationsIssued: 0 };
}

function getClinicOffsetMinutes() {
  const parsed = Number(process.env.CLINIC_UTC_OFFSET_MINUTES ?? 180);
  return Number.isFinite(parsed) ? parsed : 180;
}

type AuditEvent = Prisma.AuditLogGetPayload<{
  include: {
    actor: {
      select: {
        id: true;
        fullName: true;
        position: true;
        status: true;
      };
    };
  };
}>;

function buildSummary(events: AuditEvent[]) {
  const byActor = new Map<string, AuditEvent[]>();

  for (const event of events) {
    const key = event.actorId ?? 'system';
    byActor.set(key, [...(byActor.get(key) ?? []), event]);
  }

  return [...byActor.entries()].map(([actorId, actorEvents]) => {
    const first = actorEvents[0];
    const last = actorEvents.at(-1);
    const pageCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();
    const ipAddresses = new Set<string>();
    const userAgents = new Set<string>();
    const errors: Array<{ at: string; path: string | null; message: string | null; details: unknown }> = [];

    for (const event of actorEvents) {
      actionCounts.set(event.action, (actionCounts.get(event.action) ?? 0) + 1);

      if (event.ipAddress) {
        ipAddresses.add(event.ipAddress);
      }

      const metadata = getMetadataObject(event.metadata);
      const path = typeof metadata?.path === 'string' ? metadata.path : null;
      const userAgent = typeof metadata?.userAgent === 'string' ? metadata.userAgent : null;
      if (userAgent) {
        userAgents.add(userAgent);
      }

      if (event.action === 'ui.page_view' && path) {
        pageCounts.set(path, (pageCounts.get(path) ?? 0) + 1);
      }

      if (event.action === 'ui.frontend_error') {
        const details = getMetadataObject(metadata?.details);
        errors.push({
          at: event.createdAt.toISOString(),
          path,
          message: typeof details?.message === 'string' ? details.message : null,
          details: metadata?.details ?? null,
        });
      }
    }

    return {
      actorId,
      actorName: first?.actor?.fullName ?? 'Система',
      actorPosition: first?.actor?.position ?? null,
      firstEventAt: first?.createdAt.toISOString() ?? null,
      lastEventAt: last?.createdAt.toISOString() ?? null,
      estimatedWorkMinutes: estimateWorkMinutes(actorEvents),
      eventCount: actorEvents.length,
      ipAddresses: [...ipAddresses],
      userAgents: [...userAgents],
      topPages: topEntries(pageCounts, 20),
      actions: Object.fromEntries([...actionCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
      errors,
    };
  });
}

function estimateWorkMinutes(events: AuditEvent[]) {
  let totalMs = events.length ? 60_000 : 0;

  for (let index = 1; index < events.length; index += 1) {
    const gapMs = events[index].createdAt.getTime() - events[index - 1].createdAt.getTime();
    if (gapMs > 0 && gapMs <= workGapLimitMs) {
      totalMs += gapMs;
    }
  }

  return Math.round(totalMs / 60000);
}

function topEntries(values: Map<string, number>, limit: number) {
  return [...values.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([path, count]) => ({ path, count }));
}

function clampLimit(rawLimit?: string) {
  const value = Number(rawLimit ?? defaultExportLimit);
  if (!Number.isFinite(value) || value <= 0) {
    return defaultExportLimit;
  }

  return Math.min(Math.floor(value), maxExportLimit);
}

function getMetadataObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
