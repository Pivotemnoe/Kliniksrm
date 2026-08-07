import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildOverdueVisitWhere,
  getVisitOverdueAt,
  VISIT_OVERDUE_THRESHOLD_MINUTES,
} from '../visits/visit-overdue';

@Injectable()
export class VisitOverdueAlertTrackerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(VisitOverdueAlertTrackerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    void this.syncNow();
    this.timer = setInterval(() => void this.syncNow(), getTrackerIntervalMs());
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncNow(now = new Date()) {
    if (this.running) return { status: 'already_running' as const, created: 0 };
    this.running = true;
    let created = 0;

    try {
      const visits = await this.prisma.visit.findMany({
        where: {
          ...buildOverdueVisitWhere(now),
          overdueAlert: null,
        },
        orderBy: { startedAt: 'asc' },
        take: 200,
        select: {
          id: true,
          employeeId: true,
          startedAt: true,
          ownerId: true,
          animalId: true,
        },
      });

      for (const visit of visits) {
        const overdueAt = getVisitOverdueAt(visit.startedAt);
        try {
          await this.prisma.$transaction(async (tx) => {
            const alert = await tx.visitOverdueAlert.create({
              data: {
                visitId: visit.id,
                employeeId: visit.employeeId,
                startedAt: visit.startedAt,
                overdueAt,
                thresholdMinutes: VISIT_OVERDUE_THRESHOLD_MINUTES,
              },
            });
            await tx.auditLog.create({
              data: {
                actorId: null,
                action: 'visit.overdue_alert',
                entityType: 'Visit',
                entityId: visit.id,
                metadata: {
                  alertId: alert.id,
                  employeeId: visit.employeeId,
                  ownerId: visit.ownerId,
                  animalId: visit.animalId,
                  startedAt: visit.startedAt.toISOString(),
                  overdueAt: overdueAt.toISOString(),
                  thresholdMinutes: VISIT_OVERDUE_THRESHOLD_MINUTES,
                },
              },
            });
          });
          created += 1;
        } catch (error) {
          if (!isUniqueVisitAlert(error)) throw error;
        }
      }

      return { status: 'synced' as const, created };
    } catch (error) {
      this.logger.error(`Не удалось зафиксировать просроченные приёмы: ${errorMessage(error)}`);
      return { status: 'failed' as const, created };
    } finally {
      this.running = false;
    }
  }
}

function getTrackerIntervalMs() {
  const configured = Number(process.env.VISIT_OVERDUE_TRACKER_INTERVAL_MS ?? 60_000);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.trunc(configured), 30_000), 300_000) : 60_000;
}

function isUniqueVisitAlert(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
