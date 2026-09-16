import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeDiagnosis } from './practice-collection.service';

type Case = {
  animalId: string; diagnoses: { title: string }[];
  hospitalRecords: { title: string; plannedProductId: string | null; plannedServiceId: string | null }[];
  laboratoryOrders: { items: { title: string; testId: string | null; profileId: string | null }[] }[];
};
export type PracticeHint = { diagnosis: string; titles: string[] };

// Unique animals, not bill rows, administrations, or repeated visits.
export function buildPracticeHints(cases: Case[], diagnoses: string[]): PracticeHint[] {
  return diagnoses.flatMap((diagnosis) => {
    const key = normalizeDiagnosis(diagnosis);
    const counts = new Map<string, { title: string; animals: Set<string> }>();
    for (const item of cases) {
      const keys = new Set(item.diagnoses.map((d) => normalizeDiagnosis(d.title)));
      // With multiple diagnoses we cannot safely attribute each treatment.
      if (keys.size !== 1 || !keys.has(key)) continue;
      if (item.hospitalRecords.length > 100 || item.laboratoryOrders.length > 20
        || item.laboratoryOrders.some((o) => o.items.length > 50)) continue;
      const evidence = [
        ...item.hospitalRecords.flatMap((r) => r.plannedProductId || r.plannedServiceId
          ? [{ key: r.plannedProductId ? `product:${r.plannedProductId}` : `service:${r.plannedServiceId}`, title: r.title }] : []),
        ...item.laboratoryOrders.flatMap((o) => o.items.flatMap((r) => r.testId || r.profileId
          ? [{ key: r.testId ? `test:${r.testId}` : `profile:${r.profileId}`, title: r.title }] : [])),
      ];
      for (const row of evidence) {
        const title = row.title.trim();
        if (!title || title.length > 160) continue;
        const entry = counts.get(row.key) ?? { title, animals: new Set<string>() };
        entry.animals.add(item.animalId); counts.set(row.key, entry);
      }
    }
    const titles = [...new Set([...counts.values()].filter((v) => v.animals.size >= 3)
      .sort((a, b) => b.animals.size - a.animals.size || a.title.localeCompare(b.title, 'ru'))
      .map((v) => v.title))].slice(0, 3);
    return titles.length ? [{ diagnosis, titles }] : [];
  });
}

@Injectable()
export class PracticeHintsService {
  private readonly cache = new Map<string, { until: number; result: Promise<PracticeHint[]> }>();
  constructor(private readonly prisma: PrismaService) {}

  async forVisit(visitId: string, employeeId: string): Promise<PracticeHint[]> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { medicalPhraseAssistantEnabled: true } });
    if (!employee?.medicalPhraseAssistantEnabled) return [];
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId },
      select: { animalId: true, animal: { select: { species: true } }, diagnoses: { select: { title: true } } } });
    if (!visit?.animal.species || !visit.diagnoses.length) return [];
    const diagnoses = [...new Set(visit.diagnoses.map((d) => d.title.trim()).filter(Boolean))].slice(0, 3);
    const key = JSON.stringify([visitId, visit.animal.species, diagnoses]);
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return cached.result;
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    const result = this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
      // Immediate historical lookup: no need to wait for the silent collector.
      const cases = await tx.visit.findMany({
        where: { status: 'COMPLETED', animalId: { not: visit.animalId },
          animal: { species: { equals: visit.animal.species!, mode: 'insensitive' } },
          diagnoses: { some: { OR: diagnoses.flatMap((title) => [title, title.replace(/ё/gi, 'е'), title.replace(/е/gi, 'ё')]
            .map((title) => ({ title: { equals: title, mode: 'insensitive' as const } }))) } } },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 60,
        select: { animalId: true, diagnoses: { select: { title: true } },
          hospitalRecords: { where: { cancelledAt: null, createdAsPlan: true, recordStatus: { in: ['PLANNED', 'COMPLETED'] } },
            take: 101, orderBy: { id: 'asc' }, select: { title: true, plannedProductId: true, plannedServiceId: true } },
          laboratoryOrders: { where: { status: { not: 'CANCELLED' } }, take: 21, orderBy: { id: 'asc' },
            select: { items: { where: { status: { not: 'CANCELLED' } }, take: 51, orderBy: { id: 'asc' },
              select: { title: true, testId: true, profileId: true } } } },
        },
      });
      return buildPracticeHints(cases, diagnoses);
    }, { timeout: 3000, maxWait: 500 }).catch(() => [] as PracticeHint[]);
    this.cache.set(key, { until: Date.now() + 60_000, result });
    return result;
  }
}
