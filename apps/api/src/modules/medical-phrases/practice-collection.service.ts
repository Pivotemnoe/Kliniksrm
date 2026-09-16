import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Silent, bounded round-robin collection. Never runs in a clinical request.
 * Re-reading children is intentional: their edits need not update Visit.updatedAt.
 * One snapshot per visit replaces previous data; repeated executions are NOT cases.
 */
@Injectable()
export class PracticeCollectionService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(PracticeCollectionService.name);
  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.PRACTICE_COLLECTION_ENABLED === 'false') return;
    // No startup scan, LLM, notifications, or automatic activation after a week.
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.$transaction(async (tx) => {
        const locks = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(16092601) AS locked`;
        if (!locks[0]?.locked) return;
        const cursor = await tx.practiceCollectionCursor.upsert({
          where: { id: 'clinic' }, create: { id: 'clinic' }, update: {},
        });
        const visits = await tx.visit.findMany({
          where: { id: { gt: cursor.lastVisitId } }, orderBy: { id: 'asc' }, take: 5,
          select: {
            id: true, animalId: true, employeeId: true, status: true, startedAt: true,
            animal: { select: { species: true } },
            exam: { select: { manipulations: true } },
            laboratoryOrders: { take: 101, orderBy: { id: 'asc' }, where: { status: { not: 'CANCELLED' } },
              select: { id: true, status: true, createdById: true, items: {
                take: 201, orderBy: { id: 'asc' }, where: { status: { not: 'CANCELLED' } },
                select: { testId: true, profileId: true, title: true, status: true },
              } } },
            diagnoses: { take: 101, orderBy: { id: 'asc' }, select: { title: true, diagnosisType: true, status: true } },
            recommendation: { select: { treatmentPlan: true, careNotes: true } },
            hospitalRecords: {
              take: 201, orderBy: { id: 'asc' },
              where: { cancelledAt: null, recordStatus: { in: ['PLANNED', 'COMPLETED'] } },
              select: { plannedProductId: true, plannedServiceId: true, title: true,
                createdAsPlan: true, recordStatus: true, recordedById: true, performedById: true },
            },
          },
        });
        for (const visit of visits) {
          if (visit.status === 'CANCELLED' || !visit.diagnoses.length) {
            await tx.practiceObservation.deleteMany({ where: { visitId: visit.id } });
            continue;
          }
          const payload = JSON.parse(JSON.stringify({
            schemaVersion: 1, ...visit,
            // Do not treat partial cases as a complete denominator in future statistics.
            complete: visit.diagnoses.length <= 100 && visit.hospitalRecords.length <= 200
              && visit.laboratoryOrders.length <= 100 && visit.laboratoryOrders.every((order) => order.items.length <= 200),
            diagnosisKeys: [...new Set(visit.diagnoses.map((d) => normalizeDiagnosis(d.title)))],
            // Billing is deliberately not used as evidence of prescribing or administering.
            source: 'clinical-records',
          })) as Prisma.InputJsonValue;
          await tx.practiceObservation.upsert({ where: { visitId: visit.id },
            create: { visitId: visit.id, payload }, update: { payload, collectedAt: new Date() } });
        }
        await tx.practiceCollectionCursor.update({ where: { id: 'clinic' },
          data: { lastVisitId: visits.at(-1)?.id ?? '' } });
      }, { timeout: 4000, maxWait: 1000 });
    } catch {
      // Do not log clinical payloads. A failed batch rolls back cursor and snapshots.
      this.logger.warn('Practice collection deferred; clinical workflows are unaffected');
    } finally { this.running = false; }
  }
}

export function normalizeDiagnosis(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
}
