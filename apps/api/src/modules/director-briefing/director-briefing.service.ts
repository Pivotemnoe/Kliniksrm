import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
  AppointmentStatus,
  BusinessCategoryType,
  BusinessDailyCloseStatus,
  BusinessEntrySource,
  BusinessEntryStatus,
  EmployeeStatus,
  LaboratoryOrderStatus,
  PaymentStatus,
  Prisma,
  StockDocumentStatus,
  StockDocumentType,
  VisitStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { clinicDateKey, resolveReportRange } from '../reports/report-range';
import { buildOverdueVisitWhere } from '../visits/visit-overdue';
import { resolveVaccinationDues } from '../animals/vaccination-due';

type BriefingTrigger = 'SCHEDULED' | 'MANUAL';

@Injectable()
export class DirectorBriefingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DirectorBriefingService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  onApplicationBootstrap() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), getBriefingIntervalMs());
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async getSettings() {
    return this.prisma.organization.findFirstOrThrow({
      orderBy: { createdAt: 'asc' },
      select: {
        directorBriefingEnabled: true,
        directorBriefingTime: true,
        directorBriefingTimezone: true,
      },
    });
  }

  async updateSettings(input: { enabled: boolean; time: string; timezone?: string | null }, actorId: string) {
    const organization = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!organization) throw new BadRequestException('Организация не настроена');
    const time = normalizeTime(input.time);
    const timezone = normalizeTimezone(input.timezone);
    const settings = await this.prisma.organization.update({
      where: { id: organization.id },
      data: {
        directorBriefingEnabled: input.enabled,
        directorBriefingTime: time,
        directorBriefingTimezone: timezone,
      },
      select: {
        directorBriefingEnabled: true,
        directorBriefingTime: true,
        directorBriefingTimezone: true,
      },
    });
    await this.auditService.log({
      actorId,
      action: 'director_briefing.settings_update',
      entityType: 'Organization',
      entityId: organization.id,
      metadata: settings,
    });
    return settings;
  }

  async list() {
    return this.prisma.directorBriefing.findMany({
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
      take: 90,
    });
  }

  async generateNow(actorId: string) {
    const organization = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!organization) throw new BadRequestException('Организация не настроена');
    const businessDate = dateKeyInTimeZone(new Date(), organization.directorBriefingTimezone);
    return this.generate(organization.id, businessDate, 'MANUAL', actorId);
  }

  private async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const organizations = await this.prisma.organization.findMany({
        where: { directorBriefingEnabled: true },
        select: { id: true, directorBriefingTime: true, directorBriefingTimezone: true },
      });
      for (const organization of organizations) {
        const parts = partsInTimeZone(now, organization.directorBriefingTimezone);
        const currentTime = `${pad(parts.hour)}:${pad(parts.minute)}`;
        if (currentTime < organization.directorBriefingTime) continue;
        const exists = await this.prisma.directorBriefing.findUnique({
          where: { organizationId_businessDate: { organizationId: organization.id, businessDate: dateOnly(parts.dateKey) } },
          select: { id: true },
        });
        if (!exists) await this.generate(organization.id, parts.dateKey, 'SCHEDULED', null);
      }
    } catch (error) {
      this.logger.error(`Не удалось сформировать ежедневную сводку директора: ${errorMessage(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async generate(organizationId: string, businessDate: string, trigger: BriefingTrigger, actorId: string | null) {
    const reportDate = shiftDateKey(businessDate, -1);
    const range = resolveReportRange({ from: reportDate, to: reportDate });
    const now = new Date();
    const expiresSoon = new Date(now.getTime() + 30 * 86_400_000);
    const [visits, completedVisits, appointments, bills, payments, entries, unresolvedEntries, submittedCloses, vaccinations, lowStock, directors, debtBills, supplies, supplierPayments, supplierReturns, laboratoryOrders, openLaboratoryOrders, generatedDocuments] = await Promise.all([
      this.prisma.visit.findMany({ where: { startedAt: { gte: range.start, lte: range.end } }, select: { ownerId: true } }),
      this.prisma.visit.count({ where: { status: VisitStatus.COMPLETED, completedAt: { gte: range.start, lte: range.end }, hospitalBoxId: null } }),
      this.prisma.appointment.findMany({ where: { startsAt: { gte: range.start, lte: range.end } }, select: { status: true } }),
      this.prisma.bill.findMany({ where: { createdAt: { gte: range.start, lte: range.end }, status: { not: PaymentStatus.CANCELLED } }, select: { totalAmount: true } }),
      this.prisma.payment.findMany({ where: { paidAt: { gte: range.start, lte: range.end } }, select: { amount: true } }),
      this.prisma.businessEntry.findMany({ where: { occurredAt: { gte: range.start, lte: range.end }, status: BusinessEntryStatus.ACTIVE }, select: { type: true, source: true, amount: true, category: { select: { code: true } } } }),
      this.prisma.businessEntry.count({ where: { status: BusinessEntryStatus.ACTIVE, requiresResolution: true } }),
      this.prisma.businessDailyClose.count({ where: { status: BusinessDailyCloseStatus.SUBMITTED } }),
      this.prisma.vaccination.findMany({ where: { expiresAt: { not: null }, animal: { archivedAt: null } }, orderBy: { expiresAt: 'desc' }, select: { id: true, title: true, expiresAt: true, animal: { select: { id: true, nickname: true, owner: { select: { id: true, fullName: true, phone: true } } } } } }),
      this.prisma.product.findMany({ where: { isActive: true, minStock: { not: null } }, select: { minStock: true, batches: { where: { rest: { gt: 0 } }, select: { rest: true } } } }),
      this.prisma.employee.findMany({ where: { status: EmployeeStatus.ACTIVE, roles: { some: { role: { code: 'director' } } } }, select: { id: true } }),
      this.prisma.bill.findMany({ where: { status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] } }, select: { totalAmount: true, paidAmount: true } }),
      this.prisma.supplyInvoice.aggregate({ _sum: { totalAmount: true } }),
      this.prisma.supplierPayment.aggregate({ _sum: { amount: true } }),
      this.prisma.stockDocument.findMany({ where: { type: StockDocumentType.SUPPLIER_RETURN, status: StockDocumentStatus.POSTED }, select: { items: { select: { quantity: true, unitCost: true } } } }),
      this.prisma.laboratoryOrder.findMany({ where: { createdAt: { gte: range.start, lte: range.end } }, select: { status: true } }),
      this.prisma.laboratoryOrder.count({ where: { status: { in: [LaboratoryOrderStatus.ORDERED, LaboratoryOrderStatus.IN_PROGRESS] } } }),
      this.prisma.generatedDocument.count({ where: { createdAt: { gte: range.start, lte: range.end } } }),
    ]);

    const manualRevenue = sum(entries.filter((entry) => entry.type === BusinessCategoryType.INCOME && (entry.source === BusinessEntrySource.UNRECORDED_REVENUE || entry.category.code === 'unrecorded_revenue')), (item) => item.amount);
    const otherIncome = sum(entries.filter((entry) => entry.type === BusinessCategoryType.INCOME && entry.source !== BusinessEntrySource.UNRECORDED_REVENUE && entry.category.code !== 'unrecorded_revenue'), (item) => item.amount);
    const expenses = sum(entries.filter((entry) => entry.type === BusinessCategoryType.EXPENSE), (item) => item.amount);
    const billed = sum(bills, (item) => item.totalAmount);
    const paid = sum(payments.filter((item) => Number(item.amount) > 0), (item) => item.amount);
    const refunds = -sum(payments.filter((item) => Number(item.amount) < 0), (item) => item.amount);
    const vaccinationDues = resolveVaccinationDues(vaccinations, now);
    const unfinishedVisits = await this.prisma.visit.count({ where: { ...buildOverdueVisitWhere(now), animal: { archivedAt: null } } });
    const lowStockCount = lowStock.filter((product) => product.batches.reduce((total, batch) => total + Number(batch.rest), 0) <= Number(product.minStock)).length;
    const debtorsAmount = debtBills.reduce((total, bill) => total + Math.max(Number(bill.totalAmount) - Number(bill.paidAmount), 0), 0);
    const returnedToSuppliers = supplierReturns.reduce((total, document) => total + document.items.reduce((subtotal, item) => subtotal + Number(item.quantity) * Number(item.unitCost), 0), 0);
    const supplierPayable = Math.max(Number(supplies._sum.totalAmount ?? 0) - Number(supplierPayments._sum.amount ?? 0) - returnedToSuppliers, 0);
    const snapshot = {
      reportDate,
      visits: { total: visits.length, uniqueOwners: new Set(visits.map((item) => item.ownerId)).size, completed: completedVisits, unfinishedOverHour: unfinishedVisits },
      appointments: {
        total: appointments.length,
        completed: appointments.filter((item) => item.status === AppointmentStatus.COMPLETED).length,
        cancelled: appointments.filter((item) => item.status === AppointmentStatus.CANCELLED).length,
        noShow: appointments.filter((item) => item.status === AppointmentStatus.NO_SHOW).length,
      },
      finance: { billed, paid, refunds, manualRevenue, otherIncome, expenses, debtorsAmount, supplierPayable },
      control: { unresolvedEntries, submittedCloses },
      vaccinations: { today: vaccinationDues.today.length, overdue: vaccinationDues.overdue.length, upcoming30Days: countUpcomingVaccinations(vaccinations, now, expiresSoon) },
      stock: { lowStock: lowStockCount },
      laboratory: {
        ordered: laboratoryOrders.length,
        completed: laboratoryOrders.filter((item) => item.status === LaboratoryOrderStatus.COMPLETED).length,
        openNow: openLaboratoryOrders,
      },
      documents: { generated: generatedDocuments },
    };
    const title = `Сводка директора за ${formatDateKey(reportDate)}`;
    const summary = buildSummary(snapshot);
    const briefing = await this.prisma.directorBriefing.upsert({
      where: { organizationId_businessDate: { organizationId, businessDate: dateOnly(businessDate) } },
      create: { organizationId, businessDate: dateOnly(businessDate), rangeFrom: range.start, rangeTo: range.end, trigger, title, summary, snapshot, createdById: actorId },
      update: { rangeFrom: range.start, rangeTo: range.end, trigger, title, summary, snapshot, createdById: actorId },
    });
    await this.auditService.log({
      actorId,
      action: 'director_briefing.generate',
      entityType: 'DirectorBriefing',
      entityId: briefing.id,
      metadata: { businessDate, reportDate, trigger, directorCount: directors.length },
    });
    return briefing;
  }
}

function buildSummary(snapshot: {
  reportDate: string;
  visits: { total: number; uniqueOwners: number; completed: number; unfinishedOverHour: number };
  appointments: { total: number; completed: number; cancelled: number; noShow: number };
  finance: { billed: number; paid: number; refunds: number; manualRevenue: number; otherIncome: number; expenses: number; debtorsAmount: number; supplierPayable: number };
  control: { unresolvedEntries: number; submittedCloses: number };
  vaccinations: { today: number; overdue: number; upcoming30Days: number };
  stock: { lowStock: number };
  laboratory: { ordered: number; completed: number; openNow: number };
  documents: { generated: number };
}) {
  return [
    `Приёмы: ${snapshot.visits.total}, уникальных владельцев ${snapshot.visits.uniqueOwners}, завершено ${snapshot.visits.completed}, незавершённых более часа сейчас ${snapshot.visits.unfinishedOverHour}.`,
    `Записи: ${snapshot.appointments.total}, завершено ${snapshot.appointments.completed}, отменено ${snapshot.appointments.cancelled}, не пришли ${snapshot.appointments.noShow}.`,
    `Финансы: начислено по счетам ${money(snapshot.finance.billed)}, оплачено ${money(snapshot.finance.paid)}, возвраты ${money(snapshot.finance.refunds)}, выручка внесена вручную ${money(snapshot.finance.manualRevenue)}, прочие доходы ${money(snapshot.finance.otherIncome)}, ручные расходы ${money(snapshot.finance.expenses)}. Долги клиентов сейчас ${money(snapshot.finance.debtorsAmount)}, долг поставщикам сейчас ${money(snapshot.finance.supplierPayable)}.`,
    `Контроль: операций на проверке ${snapshot.control.unresolvedEntries}, закрытий дня на проверке ${snapshot.control.submittedCloses}.`,
    `Вакцинации: сегодня ${snapshot.vaccinations.today}, просрочено ${snapshot.vaccinations.overdue}, предстоит за 30 дней ${snapshot.vaccinations.upcoming30Days}. Низких остатков: ${snapshot.stock.lowStock}.`,
    `Лаборатория: назначено ${snapshot.laboratory.ordered}, завершено ${snapshot.laboratory.completed}, открыто сейчас ${snapshot.laboratory.openNow}. Сформировано документов: ${snapshot.documents.generated}.`,
  ].join('\n');
}

function partsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return { dateKey: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')), minute: Number(part('minute')) };
}

function dateKeyInTimeZone(value: Date, timeZone: string) {
  return partsInTimeZone(value, timeZone).dateKey;
}

function normalizeTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new BadRequestException('Время сводки должно быть в формате ЧЧ:ММ');
  return value;
}

function normalizeTimezone(value?: string | null) {
  const timezone = value?.trim() || 'Europe/Moscow';
  try { new Intl.DateTimeFormat('ru-RU', { timeZone: timezone }).format(new Date()); } catch { throw new BadRequestException('Указан неизвестный часовой пояс'); }
  return timezone;
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateKey(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function sum<T>(items: T[], resolve: (item: T) => Prisma.Decimal.Value) {
  return items.reduce((total, item) => total + Number(resolve(item)), 0);
}

function money(value: number) {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function pad(value: number) { return String(value).padStart(2, '0'); }
function countUpcomingVaccinations<T extends { title: string; expiresAt: Date | null; animal: { id: string } }>(items: T[], from: Date, to: Date) {
  const latest = new Map<string, T>();
  for (const item of items) {
    const key = `${item.animal.id}:${item.title.trim().toLocaleLowerCase('ru-RU')}`;
    if (!latest.has(key)) latest.set(key, item);
  }
  return [...latest.values()].filter((item) => item.expiresAt && item.expiresAt > from && item.expiresAt <= to).length;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function getBriefingIntervalMs() {
  const configured = Number(process.env.DIRECTOR_BRIEFING_INTERVAL_MS ?? 60_000);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.trunc(configured), 30_000), 300_000) : 60_000;
}
