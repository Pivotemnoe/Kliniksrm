import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { clinicLocalParts } from '../../common/clinic-calendar';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildPreventionSnapshot, preventionMonthRange, preventionSettings, previousPreventionMonth, PreventionSnapshot } from './prevention-report-data';
import { renderPreventionDocx } from './prevention-report-docx';
import { PreventionSettingsDto } from './dto/prevention-report.dto';
import { normalizeVaccineTitle } from './prevention-report-data';

@Injectable()
export class PreventionReportsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(PreventionReportsService.name);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' && process.env.PREVENTION_REPORT_SCHEDULER_ENABLED !== 'true') return;
    if (process.env.PREVENTION_REPORT_SCHEDULER_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.tick(), 60_000); this.timer.unref(); void this.tick();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async organization() {
    const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, include: { offices: { orderBy: { createdAt: 'asc' }, take: 1 } } });
    if (!org) throw new BadRequestException('Сначала заполните организацию клиники');
    return org;
  }
  async getSettings() { const org = await this.organization(); return preventionSettings(org.preventionReportSettings, org.offices[0]?.timezone); }
  async saveSettings(input: PreventionSettingsDto, actorId: string) {
    try { new Intl.DateTimeFormat('ru-RU', { timeZone: input.timezone }).format(new Date()); } catch { throw new BadRequestException('Неизвестный часовой пояс'); }
    const aliases = new Map<string, number>();
    input.profiles.forEach((profile, i) => [profile.title, ...profile.aliases].forEach(alias => {
      const key = normalizeVaccineTitle(alias);
      if (!key || (aliases.has(key) && aliases.get(key) !== i)) throw new BadRequestException('Вариант названия вакцины не должен относиться к двум разным составам');
      aliases.set(key, i);
    }));
    const org = await this.organization();
    await this.prisma.$transaction(async tx => {
      await tx.organization.update({ where: { id: org.id }, data: { preventionReportSettings: JSON.parse(JSON.stringify(input)) } });
      await this.audit.log({ actorId, action: 'prevention_report.settings_update', entityType: 'Organization', entityId: org.id, metadata: { enabled: input.enabled, time: input.time, timezone: input.timezone, profiles: input.profiles.length } }, tx);
    });
    return this.getSettings();
  }
  async list() {
    const org = await this.organization();
    return this.prisma.monthlyPreventionReport.findMany({ where: { organizationId: org.id }, orderBy: [{ month: 'desc' }, { revision: 'desc' }], take: 60,
      select: { id: true, month: true, revision: true, status: true, trigger: true, sha256: true, createdAt: true } });
  }
  async get(id: string) {
    const org = await this.organization();
    const report = await this.prisma.monthlyPreventionReport.findFirst({ where: { id, organizationId: org.id }, select: { id: true, month: true, revision: true, status: true, createdAt: true, sha256: true, snapshot: true } });
    if (!report) throw new NotFoundException('Отчёт не найден');
    return report;
  }
  async document(id: string, actorId: string) {
    const org = await this.organization();
    const report = await this.prisma.monthlyPreventionReport.findFirst({ where: { id, organizationId: org.id }, select: { id: true, month: true, revision: true, document: true } });
    if (!report) throw new NotFoundException('Отчёт не найден');
    await this.audit.log({ actorId, action: 'prevention_report.download', entityType: 'MonthlyPreventionReport', entityId: id, metadata: { month: report.month, revision: report.revision } });
    return report;
  }
  async generate(month: string, actorId: string | null, regenerate = false, now = new Date()) {
    const org = await this.organization();
    const settings = preventionSettings(org.preventionReportSettings, org.offices[0]?.timezone);
    let range: ReturnType<typeof preventionMonthRange>;
    try { range = preventionMonthRange(month, settings.timezone); } catch { throw new BadRequestException('Укажите месяц в формате ГГГГ-ММ'); }
    if (range.end > now) throw new BadRequestException('Выберите завершившийся календарный месяц');
    const id = await this.prisma.$transaction(async tx => {
      const key = createHash('sha256').update(`${org.id}:${month}`).digest().readInt32BE(0);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261015, ${key}::integer)`;
      const latest = await tx.monthlyPreventionReport.findFirst({ where: { organizationId: org.id, month }, orderBy: { revision: 'desc' }, select: { id: true, revision: true } });
      if (latest && !regenerate) return latest.id;
      const vaccinations = await tx.vaccination.findMany({
        where: { cancelledAt: null, vaccinatedAt: { gte: range.start, lt: range.end }, OR: [{ visitId: null }, { visit: { status: { not: 'CANCELLED' } } }] },
        include: vaccinationSourceInclude, orderBy: [{ vaccinatedAt: 'asc' }, { id: 'asc' }],
      });
      const animalIds = [...new Set(vaccinations.map(row => row.animalId))];
      const history = animalIds.length ? await tx.vaccination.findMany({
        where: { animalId: { in: animalIds }, cancelledAt: null, vaccinatedAt: { lt: range.start }, OR: [{ visitId: null }, { visit: { status: { not: 'CANCELLED' } } }] },
        include: vaccinationSourceInclude,
      }) : [];
      const cases = await tx.visit.findMany({ where: { status: 'COMPLETED', visitType: 'PRIMARY', startedAt: { gte: range.start, lt: range.end } }, select: { animalId: true, animal: { select: { species: true } }, diagnoses: { select: { title: true, diagnosisType: true, status: true } } } });
      const serialize = (row: typeof vaccinations[number]) => ({ id: row.id, animalId: row.animalId, title: row.title, vaccinatedAt: row.vaccinatedAt!.toISOString(), vaccineSeries: row.vaccineSeries,
        productTitle: row.product?.title, reportDetails: row.reportDetails, animal: { ...row.animal, birthDate: row.animal.birthDate?.toISOString() ?? null } });
      const snapshot = buildPreventionSnapshot({ month, timezone: settings.timezone, settings, generatedAt: now.toISOString(),
        clinic: { name: org.displayName, legalName: org.legalName ?? '', address: org.offices[0]?.address || org.postalAddress || org.legalAddress || '', phone: org.offices[0]?.phone ?? '' },
        vaccinations: vaccinations.map(serialize), history: history.map(serialize), cases: cases.map(row => ({ ...row, species: row.animal.species })),
      });
      const document = renderPreventionDocx(snapshot);
      const report = await tx.monthlyPreventionReport.create({ data: { organizationId: org.id, month, revision: (latest?.revision ?? 0) + 1,
        status: snapshot.status, trigger: actorId ? 'MANUAL' : 'SCHEDULED', snapshot: JSON.parse(JSON.stringify(snapshot)), document, sha256: createHash('sha256').update(document).digest('hex'), createdById: actorId,
      }, select: { id: true } });
      await this.audit.log({ actorId, action: 'prevention_report.generate', entityType: 'MonthlyPreventionReport', entityId: report.id, metadata: { month, revision: (latest?.revision ?? 0) + 1, status: snapshot.status, vaccinations: vaccinations.length, warnings: snapshot.warnings.length } }, tx);
      return report.id;
    }, { timeout: 60000, maxWait: 10000 });
    return this.get(id);
  }
  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) return;
      const local = clinicLocalParts(now, settings.timezone);
      const [hour, minute] = settings.time.split(':').map(Number);
      if (local.day === 1 && local.hour * 60 + local.minute < hour * 60 + minute) return;
      const month = previousPreventionMonth(now, settings.timezone);
      const org = await this.organization();
      if (await this.prisma.monthlyPreventionReport.findFirst({ where: { organizationId: org.id, month }, select: { id: true } })) return;
      await this.generate(month, null, false, now);
    } catch { this.logger.warn('Ежемесячный профилактический отчёт пока не сформирован; проверка будет повторена.'); }
    finally { this.running = false; }
  }
}

const vaccinationSourceInclude = { product: { select: { title: true } }, animal: { select: { nickname: true, species: true, breed: true, sex: true, birthDate: true, microchip: true, owner: { select: { fullName: true, address: true } } } } } satisfies Prisma.VaccinationInclude;
