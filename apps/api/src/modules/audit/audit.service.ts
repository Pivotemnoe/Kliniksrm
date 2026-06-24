import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditExportQueryDto } from './dto/audit-export-query.dto';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';

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
