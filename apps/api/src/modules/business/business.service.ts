import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BusinessCategoryType,
  BusinessDailyCloseStatus,
  BusinessEntrySource,
  BusinessEntryStatus,
  PaymentStatus,
  PaymentType,
  PayrollPeriodStatus,
  Prisma,
  StockDocumentStatus,
  StockDocumentType,
  StockMovementType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { clinicDateKey, resolveReportRange } from '../reports/report-range';
import { BusinessActionDto } from './dto/business-action.dto';
import { BusinessReportQueryDto } from './dto/business-report-query.dto';
import { CreateBusinessEntryDto } from './dto/create-business-entry.dto';
import { CorrectBusinessEntryDto } from './dto/correct-business-entry.dto';
import { DailyCloseQueryDto } from './dto/daily-close-query.dto';
import { ListBusinessEntriesQueryDto } from './dto/list-business-entries-query.dto';
import { SaveDailyCloseDto } from './dto/save-daily-close.dto';
import { UpsertBusinessCategoryDto } from './dto/upsert-business-category.dto';

type BusinessActor = { id: string; permissions: string[] };

const entryInclude = {
  category: true,
  office: { select: { id: true, name: true } },
  cashbox: { select: { id: true, title: true } },
  paymentMethod: { select: { id: true, title: true, type: true } },
  payrollPeriod: { select: { id: true, title: true, totalAmount: true, status: true } },
  createdBy: { select: { id: true, fullName: true } },
  voidedBy: { select: { id: true, fullName: true } },
  resolvedBy: { select: { id: true, fullName: true } },
  correctionOf: { select: { id: true, amount: true, comment: true, occurredAt: true } },
} satisfies Prisma.BusinessEntryInclude;

const closeInclude = {
  office: { select: { id: true, name: true } },
  lines: { orderBy: { titleSnapshot: 'asc' }, include: { cashbox: true, paymentMethod: true } },
  entries: { where: { status: BusinessEntryStatus.ACTIVE }, orderBy: { occurredAt: 'asc' }, include: entryInclude },
  createdBy: { select: { id: true, fullName: true } },
  submittedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.BusinessDailyCloseInclude;

@Injectable()
export class BusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getResources(actor: BusinessActor) {
    const directorAccess = has(actor, 'business.read');
    const [offices, cashboxes, paymentMethods, categories, payrollPeriods] = await this.prisma.$transaction([
      this.prisma.clinicOffice.findMany({ orderBy: { name: 'asc' }, select: { id: true, organizationId: true, name: true, timezone: true } }),
      this.prisma.cashbox.findMany({ where: { isActive: true }, orderBy: { title: 'asc' }, include: { office: { select: { id: true, name: true } } } }),
      this.prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] }),
      this.prisma.businessCategory.findMany({
        where: { isActive: true, ...(directorAccess ? {} : { administratorAllowed: true }) },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { title: 'asc' }],
      }),
      directorAccess
        ? this.prisma.payrollPeriod.findMany({ where: { status: PayrollPeriodStatus.APPROVED }, orderBy: { endsAt: 'desc' }, take: 24, select: { id: true, title: true, totalAmount: true, startsAt: true, endsAt: true } })
        : this.prisma.payrollPeriod.findMany({ where: { id: '__none__' }, take: 0, select: { id: true, title: true, totalAmount: true, startsAt: true, endsAt: true } }),
    ]);
    return { offices, cashboxes, paymentMethods, categories, payrollPeriods };
  }

  async listEntries(query: ListBusinessEntriesQueryDto, actor: BusinessActor) {
    const range = resolveReportRange(query);
    const directorAccess = has(actor, 'business.read');
    return this.prisma.businessEntry.findMany({
      where: {
        occurredAt: { gte: range.start, lte: range.end },
        ...(query.officeId ? { officeId: query.officeId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.dailyCloseId ? { dailyCloseId: query.dailyCloseId } : {}),
        ...(directorAccess ? {} : { category: { administratorAllowed: true } }),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: entryInclude,
      take: 500,
    });
  }

  async createEntry(dto: CreateBusinessEntryDto, actor: BusinessActor) {
    const [entry] = await this.createEntriesBatch([dto], actor);
    return entry;
  }

  async createEntriesBatch(dtos: CreateBusinessEntryDto[], actor: BusinessActor) {
    const prepared: Array<{ data: Prisma.BusinessEntryUncheckedCreateInput }> = [];
    for (const dto of dtos) {
      prepared.push(await this.prepareEntry(dto, actor));
    }

    return this.prisma.$transaction(async (tx) => {
      const entries = [];
      for (const item of prepared) {
        const entry = await tx.businessEntry.create({
          data: item.data,
          include: entryInclude,
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'business.entry.create',
            entityType: 'BusinessEntry',
            entityId: entry.id,
            metadata: { type: entry.type, source: entry.source, amount: Number(entry.amount) },
          },
        });
        entries.push(entry);
      }
      return entries;
    });
  }

  private async prepareEntry(dto: CreateBusinessEntryDto, actor: BusinessActor): Promise<{
    data: Prisma.BusinessEntryUncheckedCreateInput;
  }> {
    const category = await this.prisma.businessCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category || !category.isActive) throw new NotFoundException('Активная статья доходов или расходов не найдена');
    const directorAccess = has(actor, 'business.manage');
    if (!directorAccess && !category.administratorAllowed) throw new ForbiddenException('Эта статья доступна только директору');
    if (category.type !== dto.type) throw new BadRequestException('Тип операции не соответствует выбранной статье');
    if (dto.payrollPeriodId && !directorAccess) throw new ForbiddenException('Выплату зарплаты может регистрировать только директор');

    const source = dto.source ?? (category.code === 'unrecorded_revenue' ? BusinessEntrySource.UNRECORDED_REVENUE : BusinessEntrySource.MANUAL);
    const administratorSources = new Set<BusinessEntrySource>([BusinessEntrySource.MANUAL, BusinessEntrySource.UNRECORDED_REVENUE, BusinessEntrySource.DAILY_DIFFERENCE]);
    if (!directorAccess && !administratorSources.has(source)) {
      throw new ForbiddenException('Выбранный вид операции доступен только директору');
    }
    if (source === BusinessEntrySource.UNRECORDED_REVENUE && dto.type !== BusinessCategoryType.INCOME) {
      throw new BadRequestException('Неучтённая выручка должна быть доходом');
    }
    if (category.code === 'payroll' && source !== BusinessEntrySource.PAYROLL_PAYOUT) {
      throw new BadRequestException('Выплата зарплаты должна быть связана с утверждённым расчётом');
    }
    if (source === BusinessEntrySource.PAYROLL_PAYOUT && (category.code !== 'payroll' || !dto.payrollPeriodId)) {
      throw new BadRequestException('Для выплаты зарплаты выберите статью зарплаты и утверждённый расчёт');
    }
    const comment = clean(dto.comment);
    if ((source === BusinessEntrySource.UNRECORDED_REVENUE || source === BusinessEntrySource.DAILY_DIFFERENCE) && !comment) {
      throw new BadRequestException('Для неучтённой выручки или расхождения укажите пояснение');
    }
    if (category.code === 'daily_salary' && !clean(dto.counterparty)) {
      throw new BadRequestException('Для выданной зарплаты укажите сотрудника или получателя');
    }

    const occurredAt = new Date(dto.occurredAt);
    await this.validateEntryLinks(dto);
    if (dto.officeId) await this.ensureDayEditable(dto.officeId, occurredAt);
    if (dto.dailyCloseId) {
      const close = await this.prisma.businessDailyClose.findUnique({ where: { id: dto.dailyCloseId } });
      if (!close || close.status !== BusinessDailyCloseStatus.DRAFT) throw new BadRequestException('Добавлять операции можно только в черновик закрытия дня');
      if (dto.officeId && close.officeId !== dto.officeId) throw new BadRequestException('Операция относится к другому филиалу');
    }

    return {
      data: {
        type: dto.type,
        source,
        categoryId: dto.categoryId,
        officeId: dto.officeId,
        cashboxId: dto.cashboxId,
        paymentMethodId: dto.paymentMethodId,
        payrollPeriodId: dto.payrollPeriodId,
        dailyCloseId: dto.dailyCloseId,
        amount: dto.amount,
        occurredAt,
        counterparty: clean(dto.counterparty),
        documentNumber: clean(dto.documentNumber),
        comment,
        requiresResolution: source === BusinessEntrySource.UNRECORDED_REVENUE || dto.requiresResolution === true || !directorAccess,
        createdById: actor.id,
      },
    };
  }

  async voidEntry(entryId: string, dto: BusinessActionDto, actor: BusinessActor) {
    const entry = await this.prisma.businessEntry.findUnique({ where: { id: entryId }, include: { category: true, dailyClose: { select: { id: true, status: true, comment: true } } } });
    if (!entry) throw new NotFoundException('Операция не найдена');
    if (entry.status !== BusinessEntryStatus.ACTIVE) throw new BadRequestException('Операция уже отменена');
    const directorAccess = has(actor, 'business.manage');
    if (!directorAccess && !entry.category.administratorAllowed) throw new ForbiddenException('Эта операция доступна только директору');
    const close = entry.dailyClose ?? await this.findCloseForEntry(entry.officeId, entry.occurredAt);
    if (close && close.status !== BusinessDailyCloseStatus.DRAFT && !directorAccess) {
      throw new BadRequestException('День уже отправлен директору. Исправить его может только директор либо после возврата в черновик');
    }
    const reason = dto.reason.trim();
    if (reason.length < 2) throw new BadRequestException('Укажите причину отмены');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (close && close.status !== BusinessDailyCloseStatus.DRAFT) {
        await tx.businessDailyClose.update({ where: { id: close.id }, data: reopenCloseData(close.comment, `Отмена операции: ${reason}`) });
        await tx.auditLog.create({ data: { actorId: actor.id, action: 'business.daily_close.reopen_for_entry_void', entityType: 'BusinessDailyClose', entityId: close.id, metadata: { entryId, previousStatus: close.status, reason } } });
      }
      const voided = await tx.businessEntry.update({
        where: { id: entryId },
        data: { status: BusinessEntryStatus.VOIDED, voidedAt: new Date(), voidedById: actor.id, voidReason: reason },
        include: entryInclude,
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'business.entry.void', entityType: 'BusinessEntry', entityId: entryId, metadata: { reason, amount: Number(entry.amount), categoryId: entry.categoryId } } });
      return voided;
    });
    if (close) await this.syncDailyClose(close.id);
    return updated;
  }

  async correctEntry(entryId: string, dto: CorrectBusinessEntryDto, actor: BusinessActor) {
    const entry = await this.prisma.businessEntry.findUnique({
      where: { id: entryId },
      include: { category: true, dailyClose: { select: { id: true, status: true, comment: true } } },
    });
    if (!entry) throw new NotFoundException('Операция не найдена');
    if (entry.status !== BusinessEntryStatus.ACTIVE) throw new BadRequestException('Исправить можно только действующую операцию');

    const category = await this.prisma.businessCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category || !category.isActive) throw new NotFoundException('Активная статья расходов или доходов не найдена');
    const directorAccess = has(actor, 'business.manage');
    if (!directorAccess && (!entry.category.administratorAllowed || !category.administratorAllowed)) {
      throw new ForbiddenException('Эта операция доступна только директору');
    }
    if (category.type !== entry.type) throw new BadRequestException('Исправление не может менять доход на расход или расход на доход');
    if (entry.source === BusinessEntrySource.PAYROLL_PAYOUT && category.code !== 'payroll') {
      throw new BadRequestException('Связанную выплату расчётной зарплаты можно оставить только в статье расчётной зарплаты');
    }
    if (entry.source !== BusinessEntrySource.PAYROLL_PAYOUT && category.code === 'payroll') {
      throw new BadRequestException('Для независимой выплаты за день выберите статью «Зарплата, выданная за день»');
    }
    if (category.code === 'daily_salary' && !clean(dto.counterparty)) {
      throw new BadRequestException('Для выданной зарплаты укажите сотрудника или получателя');
    }

    await this.validateEntryLinks({
      officeId: entry.officeId ?? undefined,
      cashboxId: dto.cashboxId,
      paymentMethodId: dto.paymentMethodId,
      payrollPeriodId: entry.payrollPeriodId ?? undefined,
    });
    const close = entry.dailyClose ?? await this.findCloseForEntry(entry.officeId, entry.occurredAt);
    if (close && close.status !== BusinessDailyCloseStatus.DRAFT && !directorAccess) {
      throw new BadRequestException('День уже отправлен директору. Исправить его может только директор либо после возврата в черновик');
    }

    const reason = dto.reason.trim();
    if (reason.length < 2) throw new BadRequestException('Укажите причину исправления');
    const corrected = await this.prisma.$transaction(async (tx) => {
      if (close && close.status !== BusinessDailyCloseStatus.DRAFT) {
        await tx.businessDailyClose.update({ where: { id: close.id }, data: reopenCloseData(close.comment, `Исправление операции: ${reason}`) });
        await tx.auditLog.create({ data: { actorId: actor.id, action: 'business.daily_close.reopen_for_entry_correction', entityType: 'BusinessDailyClose', entityId: close.id, metadata: { entryId, previousStatus: close.status, reason } } });
      }

      await tx.businessEntry.update({
        where: { id: entryId },
        data: { status: BusinessEntryStatus.VOIDED, voidedAt: new Date(), voidedById: actor.id, voidReason: `Исправлено: ${reason}` },
      });
      const replacement = await tx.businessEntry.create({
        data: {
          type: entry.type,
          source: entry.source,
          categoryId: category.id,
          officeId: entry.officeId,
          cashboxId: dto.cashboxId ?? null,
          paymentMethodId: dto.paymentMethodId ?? null,
          payrollPeriodId: entry.payrollPeriodId,
          dailyCloseId: entry.dailyCloseId ?? close?.id ?? null,
          correctionOfId: entry.id,
          amount: dto.amount,
          occurredAt: entry.occurredAt,
          counterparty: clean(dto.counterparty),
          documentNumber: clean(dto.documentNumber),
          comment: clean(dto.comment),
          requiresResolution: entry.requiresResolution || !directorAccess,
          createdById: actor.id,
        },
        include: entryInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'business.entry.correct',
          entityType: 'BusinessEntry',
          entityId: replacement.id,
          metadata: {
            originalEntryId: entry.id,
            reason,
            before: { categoryId: entry.categoryId, amount: Number(entry.amount), counterparty: entry.counterparty, documentNumber: entry.documentNumber, comment: entry.comment },
            after: { categoryId: category.id, amount: dto.amount, counterparty: clean(dto.counterparty), documentNumber: clean(dto.documentNumber), comment: clean(dto.comment) },
          },
        },
      });
      return replacement;
    });
    if (close) await this.syncDailyClose(close.id);
    return corrected;
  }

  async resolveEntry(entryId: string, dto: BusinessActionDto, actorId: string) {
    const reason = dto.reason.trim();
    if (reason.length < 2) throw new BadRequestException('Укажите комментарий к утверждению');
    const result = await this.prisma.businessEntry.updateMany({
      where: { id: entryId, status: BusinessEntryStatus.ACTIVE, requiresResolution: true },
      data: { requiresResolution: false, resolvedAt: new Date(), resolvedById: actorId, resolutionNote: reason },
    });
    if (!result.count) throw new BadRequestException('Неучтённая операция не найдена или уже разобрана');
    await this.auditService.log({ actorId, action: 'business.entry.resolve', entityType: 'BusinessEntry', entityId: entryId, metadata: { reason } });
    return this.prisma.businessEntry.findUniqueOrThrow({ where: { id: entryId }, include: entryInclude });
  }

  listCategories() {
    return this.prisma.businessCategory.findMany({
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async saveCategory(categoryId: string | null, dto: UpsertBusinessCategoryDto, actorId: string) {
    const existing = categoryId ? await this.prisma.businessCategory.findUnique({ where: { id: categoryId } }) : null;
    if (categoryId && !existing) throw new NotFoundException('Статья доходов или расходов не найдена');
    if (existing && existing.type !== dto.type) throw new BadRequestException('Тип существующей статьи менять нельзя; создайте новую статью');
    const title = dto.title.trim();
    if (title.length < 2) throw new BadRequestException('Укажите название статьи');
    const code = existing?.code ?? dto.code?.trim() ?? `custom_${randomUUID().replaceAll('-', '')}`;
    const groupCode = dto.groupCode?.trim() ?? existing?.groupCode ?? (dto.type === BusinessCategoryType.INCOME ? 'REVENUE' : 'OPERATING');
    const data = {
      code,
      title,
      type: dto.type,
      groupCode,
      affectsProfit: dto.affectsProfit,
      administratorAllowed: dto.administratorAllowed ?? existing?.administratorAllowed ?? false,
      isActive: dto.isActive ?? existing?.isActive ?? true,
      sortOrder: dto.sortOrder ?? existing?.sortOrder ?? 0,
    };
    const category = existing
      ? await this.prisma.businessCategory.update({ where: { id: existing.id }, data })
      : await this.prisma.businessCategory.create({ data });
    await this.auditService.log({ actorId, action: categoryId ? 'business.category.update' : 'business.category.create', entityType: 'BusinessCategory', entityId: category.id, metadata: { code: category.code } });
    return category;
  }

  async getDailyClose(query: DailyCloseQueryDto) {
    const close = await this.prisma.businessDailyClose.findUnique({
      where: { officeId_businessDate: { officeId: query.officeId, businessDate: dateOnly(query.businessDate) } },
      include: closeInclude,
    });
    if (!close) return null;
    const snapshot = await this.calculateDailySnapshot(query.officeId, query.businessDate);
    return attachDailyLineBreakdown(close, snapshot.lines);
  }

  async prepareDailyClose(dto: SaveDailyCloseDto, actor: BusinessActor) {
    const office = await this.prisma.clinicOffice.findUnique({ where: { id: dto.officeId }, select: { id: true, organizationId: true } });
    if (!office) throw new NotFoundException('Филиал не найден');
    const businessDate = dateOnly(dto.businessDate);
    let close = await this.prisma.businessDailyClose.upsert({
      where: { officeId_businessDate: { officeId: dto.officeId, businessDate } },
      update: {},
      create: { organizationId: office.organizationId, officeId: dto.officeId, businessDate, createdById: actor.id },
    });
    if (close.status !== BusinessDailyCloseStatus.DRAFT) return this.getCloseById(close.id);
    close = await this.syncDailyClose(close.id, dto.lines, dto.comment);
    await this.auditService.log({ actorId: actor.id, action: 'business.daily_close.save', entityType: 'BusinessDailyClose', entityId: close.id, metadata: { businessDate: dto.businessDate, difference: close.difference } });
    return close;
  }

  async listDailyCloses(query: BusinessReportQueryDto) {
    const range = resolveReportRange(query);
    return this.prisma.businessDailyClose.findMany({
      where: { businessDate: { gte: dateOnly(range.from), lte: dateOnly(range.to) }, ...(query.officeId ? { officeId: query.officeId } : {}) },
      orderBy: { businessDate: 'desc' },
      include: closeInclude,
      take: 500,
    });
  }

  async submitDailyClose(closeId: string, actorId: string) {
    const close = await this.syncDailyClose(closeId);
    if (close.status !== BusinessDailyCloseStatus.DRAFT) throw new BadRequestException('Отправить можно только черновик');
    if (!decimal(close.difference).equals(0) && !clean(close.comment ?? undefined)) {
      throw new BadRequestException('При расхождении обязательно укажите пояснение');
    }
    const updated = await this.prisma.businessDailyClose.update({
      where: { id: closeId },
      data: { status: BusinessDailyCloseStatus.SUBMITTED, submittedById: actorId, submittedAt: new Date() },
      include: closeInclude,
    });
    await this.auditService.log({ actorId, action: 'business.daily_close.submit', entityType: 'BusinessDailyClose', entityId: closeId, metadata: { difference: updated.difference } });
    return updated;
  }

  async approveDailyClose(closeId: string, actorId: string) {
    const close = await this.prisma.businessDailyClose.findUnique({ where: { id: closeId }, include: { lines: true } });
    if (!close) throw new NotFoundException('Закрытие дня не найдено');
    if (close.status !== BusinessDailyCloseStatus.SUBMITTED) throw new BadRequestException('Утвердить можно только отправленное закрытие дня');
    const snapshot = await this.calculateDailySnapshot(close.officeId, dateKey(close.businessDate));
    const snapshotLines = new Map(snapshot.lines.map((line) => [line.lineKey, line.systemAmount]));
    const linesChanged = close.lines.length !== snapshot.lines.length
      || close.lines.some((line) => !snapshotLines.get(line.lineKey)?.equals(line.systemAmount));
    if (!decimal(close.expectedAmount).equals(snapshot.expectedAmount) || linesChanged) {
      throw new BadRequestException('После отправки изменились оплаты или расходы. Верните день администратору и сформируйте сверку заново');
    }
    const approvedAt = new Date();
    const resolutionNote = 'Подтверждено при утверждении закрытия дня';
    return this.prisma.$transaction(async (tx) => {
      const unresolvedEntries = await tx.businessEntry.findMany({
        where: { dailyCloseId: closeId, status: BusinessEntryStatus.ACTIVE, requiresResolution: true },
        select: { id: true },
      });

      if (unresolvedEntries.length) {
        await tx.businessEntry.updateMany({
          where: { id: { in: unresolvedEntries.map((entry) => entry.id) } },
          data: { requiresResolution: false, resolvedAt: approvedAt, resolvedById: actorId, resolutionNote },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'business.entry.resolve.daily_close',
            entityType: 'BusinessDailyClose',
            entityId: closeId,
            metadata: { resolvedCount: unresolvedEntries.length, entryIds: unresolvedEntries.map((entry) => entry.id), reason: resolutionNote },
          },
        });
      }

      const updated = await tx.businessDailyClose.update({
        where: { id: closeId },
        data: { status: BusinessDailyCloseStatus.APPROVED, approvedById: actorId, approvedAt },
        include: closeInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'business.daily_close.approve',
          entityType: 'BusinessDailyClose',
          entityId: closeId,
          metadata: { difference: Number(updated.difference), resolvedEntries: unresolvedEntries.length },
        },
      });
      return updated;
    });
  }

  async returnDailyClose(closeId: string, dto: BusinessActionDto, actorId: string) {
    const close = await this.prisma.businessDailyClose.findUnique({ where: { id: closeId }, select: { status: true, comment: true } });
    if (!close || close.status !== BusinessDailyCloseStatus.SUBMITTED) {
      throw new BadRequestException('Вернуть можно только отправленное закрытие дня');
    }
    const result = await this.prisma.businessDailyClose.updateMany({
      where: { id: closeId, status: BusinessDailyCloseStatus.SUBMITTED },
      data: { status: BusinessDailyCloseStatus.DRAFT, submittedById: null, submittedAt: null, comment: appendComment(close.comment, dto.reason) },
    });
    if (!result.count) throw new BadRequestException('Вернуть можно только отправленное закрытие дня');
    await this.auditService.log({ actorId, action: 'business.daily_close.return', entityType: 'BusinessDailyClose', entityId: closeId, metadata: { reason: dto.reason.trim() } });
    return this.getCloseById(closeId);
  }

  async getSummary(query: BusinessReportQueryDto) {
    const range = resolveReportRange(query);
    const duration = range.end.getTime() - range.start.getTime() + 1;
    const previousEnd = new Date(range.start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duration + 1);
    const [current, previous, closes, debtBills, supplierData, unresolved] = await Promise.all([
      this.loadMetrics(range.start, range.end, range.offsetMinutes, query.officeId),
      this.loadMetrics(previousStart, previousEnd, range.offsetMinutes, query.officeId),
      this.listDailyCloses(query),
      this.prisma.bill.findMany({
        where: { status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] }, ...(query.officeId ? { owner: { officeId: query.officeId } } : {}) },
        select: { totalAmount: true, paidAmount: true },
      }),
      this.loadSupplierDebt(),
      this.prisma.businessEntry.count({ where: { status: BusinessEntryStatus.ACTIVE, requiresResolution: true, ...(query.officeId ? { officeId: query.officeId } : {}) } }),
    ]);
    const debtorsAmount = debtBills.reduce((total, bill) => total + Math.max(number(bill.totalAmount) - number(bill.paidAmount), 0), 0);
    return {
      generatedAt: new Date().toISOString(),
      range: { from: range.from, to: range.to },
      officeId: query.officeId ?? null,
      current,
      previous: { accruedRevenue: previous.accruedRevenue, operatingProfit: previous.operatingProfit, cashNet: previous.cashNet },
      balances: { debtorsAmount, supplierPayable: supplierData },
      control: {
        unresolvedEntries: unresolved,
        draftDays: closes.filter((item) => item.status === BusinessDailyCloseStatus.DRAFT).length,
        submittedDays: closes.filter((item) => item.status === BusinessDailyCloseStatus.SUBMITTED).length,
        approvedDays: closes.filter((item) => item.status === BusinessDailyCloseStatus.APPROVED).length,
        totalDifference: closes.reduce((total, item) => total + number(item.difference), 0),
      },
      closes,
    };
  }

  private async syncDailyClose(closeId: string, inputLines?: SaveDailyCloseDto['lines'], comment?: string) {
    const existing = await this.prisma.businessDailyClose.findUnique({ where: { id: closeId }, include: { lines: true } });
    if (!existing) throw new NotFoundException('Закрытие дня не найдено');
    if (existing.status !== BusinessDailyCloseStatus.DRAFT) return this.getCloseById(closeId);
    const snapshot = await this.calculateDailySnapshot(existing.officeId, dateKey(existing.businessDate));
    const inputMap = new Map((inputLines ?? []).map((line) => [line.lineKey, line]));
    const oldMap = new Map(existing.lines.map((line) => [line.lineKey, line]));
    const allLines = new Map(snapshot.lines.map((line) => [line.lineKey, line]));
    for (const line of existing.lines) {
      if (!allLines.has(line.lineKey) && !decimal(line.actualAmount).equals(0)) {
        allLines.set(line.lineKey, {
          lineKey: line.lineKey,
          titleSnapshot: line.titleSnapshot,
          paymentType: line.paymentType,
          cashboxId: line.cashboxId,
          paymentMethodId: line.paymentMethodId,
          systemAmount: decimal(0),
          inflowAmount: decimal(0),
          outflowAmount: decimal(0),
        });
      }
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const keepKeys = [...allLines.keys()];
      await tx.businessDailyCloseLine.deleteMany({ where: { dailyCloseId: closeId, ...(keepKeys.length ? { lineKey: { notIn: keepKeys } } : {}) } });
      for (const line of allLines.values()) {
        const input = inputMap.get(line.lineKey);
        const actualAmount = decimal(input?.actualAmount ?? oldMap.get(line.lineKey)?.actualAmount ?? 0);
        await tx.businessDailyCloseLine.upsert({
          where: { dailyCloseId_lineKey: { dailyCloseId: closeId, lineKey: line.lineKey } },
          update: { titleSnapshot: line.titleSnapshot, paymentType: line.paymentType, cashboxId: line.cashboxId, paymentMethodId: line.paymentMethodId, systemAmount: line.systemAmount, actualAmount, difference: actualAmount.minus(line.systemAmount), comment: clean(input?.comment) },
          create: { dailyCloseId: closeId, lineKey: line.lineKey, titleSnapshot: line.titleSnapshot, paymentType: line.paymentType, cashboxId: line.cashboxId, paymentMethodId: line.paymentMethodId, systemAmount: line.systemAmount, actualAmount, difference: actualAmount.minus(line.systemAmount), comment: clean(input?.comment) },
        });
      }
      const savedLines = await tx.businessDailyCloseLine.findMany({ where: { dailyCloseId: closeId } });
      const actualAmount = sum(savedLines.map((line) => line.actualAmount));
      await tx.businessDailyClose.update({
        where: { id: closeId },
        data: {
          systemIncome: snapshot.systemIncome,
          systemRefunds: snapshot.systemRefunds,
          systemExpense: snapshot.systemExpense,
          manualIncome: snapshot.manualIncome,
          manualExpense: snapshot.manualExpense,
          expectedAmount: snapshot.expectedAmount,
          actualAmount,
          difference: actualAmount.minus(snapshot.expectedAmount),
          ...(comment !== undefined ? { comment: clean(comment) } : {}),
        },
      });
      return tx.businessDailyClose.findUniqueOrThrow({ where: { id: closeId }, include: closeInclude });
    });
    return attachDailyLineBreakdown(saved, snapshot.lines);
  }

  private async calculateDailySnapshot(officeId: string, businessDate: string) {
    const range = resolveReportRange({ from: businessDate, to: businessDate });
    const [payments, supplierPayments, entries] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paidAt: { gte: range.start, lte: range.end }, type: { not: PaymentType.DEPOSIT }, OR: [{ cashbox: { officeId } }, { bill: { owner: { officeId } } }] },
        include: { cashbox: true, paymentMethod: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: { paidAt: { gte: range.start, lte: range.end }, cashbox: { officeId } },
        include: { cashbox: true, paymentMethod: true },
      }),
      this.prisma.businessEntry.findMany({
        where: { occurredAt: { gte: range.start, lte: range.end }, officeId, status: BusinessEntryStatus.ACTIVE },
        include: { cashbox: true, paymentMethod: true },
      }),
    ]);
    const lineMap = new Map<string, DailyLine>();
    let systemIncome = decimal(0);
    let systemRefunds = decimal(0);
    let systemExpense = decimal(0);
    let manualIncome = decimal(0);
    let manualExpense = decimal(0);
    for (const payment of payments) {
      const amount = decimal(payment.amount);
      if (amount.greaterThanOrEqualTo(0)) systemIncome = systemIncome.plus(amount);
      else systemRefunds = systemRefunds.plus(amount.abs());
      addDailyLine(lineMap, payment, amount);
    }
    for (const payment of supplierPayments) {
      const amount = decimal(payment.amount);
      systemExpense = systemExpense.plus(amount);
      addDailyLine(lineMap, { ...payment, type: payment.paymentMethod?.type ?? PaymentType.OTHER }, amount.negated());
    }
    for (const entry of entries) {
      const amount = decimal(entry.amount);
      const signed = entry.type === BusinessCategoryType.INCOME ? amount : amount.negated();
      if (entry.type === BusinessCategoryType.INCOME) manualIncome = manualIncome.plus(amount);
      else manualExpense = manualExpense.plus(amount);
      addDailyLine(lineMap, { ...entry, type: entry.paymentMethod?.type ?? PaymentType.OTHER }, signed);
    }
    return {
      systemIncome,
      systemRefunds,
      systemExpense,
      manualIncome,
      manualExpense,
      expectedAmount: systemIncome.minus(systemRefunds).minus(systemExpense).plus(manualIncome).minus(manualExpense),
      lines: [...lineMap.values()].sort((left, right) => left.titleSnapshot.localeCompare(right.titleSnapshot, 'ru')),
    };
  }

  private async loadMetrics(start: Date, end: Date, offsetMinutes: number, officeId?: string) {
    const dateWhere = { gte: start, lte: end };
    const [bills, payments, movements, entries, supplierPayments, payroll, visits, newOwners] = await Promise.all([
      this.prisma.bill.findMany({ where: { createdAt: dateWhere, status: { not: PaymentStatus.CANCELLED }, ...(officeId ? { owner: { officeId } } : {}) }, select: { createdAt: true, totalAmount: true } }),
      this.prisma.payment.findMany({ where: { paidAt: dateWhere, type: { not: PaymentType.DEPOSIT }, ...(officeId ? { OR: [{ cashbox: { officeId } }, { bill: { owner: { officeId } } }] } : {}) }, select: { paidAt: true, amount: true, type: true } }),
      this.prisma.stockMovement.findMany({
        where: { createdAt: dateWhere, type: { in: [StockMovementType.SALE, StockMovementType.VISIT_USAGE, StockMovementType.CORRECTION] }, stockBatchId: { not: null }, ...(officeId ? { warehouse: { officeId } } : {}) },
        select: { createdAt: true, type: true, quantity: true, unitCost: true, billItemId: true, visitId: true, saleId: true, stockBatch: { select: { purchasePrice: true } } },
      }),
      this.prisma.businessEntry.findMany({ where: { occurredAt: dateWhere, status: BusinessEntryStatus.ACTIVE, ...(officeId ? { officeId } : {}) }, include: { category: true } }),
      this.prisma.supplierPayment.findMany({ where: { paidAt: dateWhere, ...(officeId ? { cashbox: { officeId } } : {}) }, select: { paidAt: true, amount: true } }),
      this.prisma.payrollPeriod.findMany({ where: { status: PayrollPeriodStatus.APPROVED, endsAt: dateWhere }, select: { totalAmount: true } }),
      this.prisma.visit.findMany({ where: { startedAt: dateWhere, ...(officeId ? { owner: { officeId } } : {}) }, select: { id: true, ownerId: true } }),
      this.prisma.owner.count({ where: { createdAt: dateWhere, ...(officeId ? { officeId } : {}) } }),
    ]);

    const accruedSystemRevenue = total(bills, (item) => item.totalAmount);
    const cashIncome = total(payments.filter((item) => number(item.amount) > 0), (item) => item.amount);
    const refunds = -total(payments.filter((item) => number(item.amount) < 0), (item) => item.amount);
    const manualIncome = entries.filter((item) => item.type === BusinessCategoryType.INCOME).reduce((value, item) => value + number(item.amount), 0);
    const manualExpense = entries.filter((item) => item.type === BusinessCategoryType.EXPENSE).reduce((value, item) => value + number(item.amount), 0);
    const profitIncome = entries.filter((item) => item.type === BusinessCategoryType.INCOME && item.category.affectsProfit).reduce((value, item) => value + number(item.amount), 0);
    const dailySalaryExpense = entries
      .filter((item) => item.type === BusinessCategoryType.EXPENSE && item.category.code === 'daily_salary')
      .reduce((value, item) => value + number(item.amount), 0);
    const operatingExpenses = entries
      .filter((item) => item.type === BusinessCategoryType.EXPENSE && item.category.affectsProfit && item.category.code !== 'daily_salary')
      .reduce((value, item) => value + number(item.amount), 0);
    const supplierOutflow = total(supplierPayments, (item) => item.amount);
    const payrollExpense = total(payroll, (item) => item.totalAmount);
    const costOfGoods = Math.max(movements.reduce((value, movement) => {
      const documentedCorrection = movement.type === StockMovementType.CORRECTION && Boolean(movement.billItemId || movement.visitId || movement.saleId);
      if (movement.type === StockMovementType.CORRECTION && !documentedCorrection) return value;
      return value - number(movement.quantity) * number(movement.unitCost ?? movement.stockBatch?.purchasePrice);
    }, 0), 0);
    const result = calculateManagementResult({
      accruedSystemRevenue, profitIncome, costOfGoods, payrollExpense, dailySalaryExpense, operatingExpenses,
      cashIncome, refunds, manualIncome, manualExpense, supplierOutflow,
    });
    const daily = aggregateBusinessDaily({ bills, payments, movements, entries, supplierPayments }, offsetMinutes);
    const categoryExpenses = aggregateCategories(entries.filter((item) => item.type === BusinessCategoryType.EXPENSE));
    const categoryIncome = aggregateCategories(entries.filter((item) => item.type === BusinessCategoryType.INCOME));
    return {
      accruedSystemRevenue, ...result, cashIncome, refunds, manualIncome, manualExpense, supplierOutflow,
      costOfGoods, payrollExpense, dailySalaryExpense, operatingExpenses,
      billsCount: bills.length, averageBill: bills.length ? accruedSystemRevenue / bills.length : 0,
      visits: visits.length, uniqueOwners: new Set(visits.map((item) => item.ownerId)).size, newOwners,
      daily, categoryExpenses, categoryIncome,
      note: officeId
        ? 'Расчётная зарплата отражена по всей организации. Зарплата, внесённая при закрытии дня, учитывается отдельно по выбранному филиалу и автоматически с расчётными периодами не сверяется.'
        : 'Расчётная зарплата и фактические выплаты, внесённые при закрытии дня, показаны раздельно и автоматически не сверяются. Прибыль управленческая и не заменяет бухгалтерскую или налоговую отчётность.',
    };
  }

  private async loadSupplierDebt() {
    const [supplies, payments, returns] = await Promise.all([
      this.prisma.supplyInvoice.aggregate({ _sum: { totalAmount: true } }),
      this.prisma.supplierPayment.aggregate({ _sum: { amount: true } }),
      this.prisma.stockDocument.findMany({ where: { type: StockDocumentType.SUPPLIER_RETURN, status: StockDocumentStatus.POSTED }, select: { items: { select: { quantity: true, unitCost: true } } } }),
    ]);
    const returned = returns.reduce((value, document) => value + document.items.reduce((subtotal, item) => subtotal + number(item.quantity) * number(item.unitCost), 0), 0);
    return Math.max(number(supplies._sum.totalAmount) - number(payments._sum.amount) - returned, 0);
  }

  private async validateEntryLinks(dto: Pick<CreateBusinessEntryDto, 'officeId' | 'cashboxId' | 'paymentMethodId' | 'payrollPeriodId'>) {
    if (dto.officeId) {
      const office = await this.prisma.clinicOffice.findUnique({ where: { id: dto.officeId }, select: { id: true } });
      if (!office) throw new NotFoundException('Филиал не найден');
    }
    if (dto.cashboxId) {
      const cashbox = await this.prisma.cashbox.findUnique({ where: { id: dto.cashboxId }, select: { id: true, officeId: true, isActive: true } });
      if (!cashbox || !cashbox.isActive) throw new NotFoundException('Активная касса не найдена');
      if (dto.officeId && cashbox.officeId && cashbox.officeId !== dto.officeId) throw new BadRequestException('Касса относится к другому филиалу');
    }
    if (dto.paymentMethodId) {
      const method = await this.prisma.paymentMethod.findUnique({ where: { id: dto.paymentMethodId }, select: { id: true, isActive: true } });
      if (!method || !method.isActive) throw new NotFoundException('Активный способ оплаты не найден');
    }
    if (dto.payrollPeriodId) {
      const period = await this.prisma.payrollPeriod.findUnique({ where: { id: dto.payrollPeriodId }, select: { status: true } });
      if (!period || period.status !== PayrollPeriodStatus.APPROVED) throw new BadRequestException('Можно выплатить только утверждённую зарплату');
    }
  }

  private async ensureDayEditable(officeId: string, occurredAt: Date) {
    const close = await this.prisma.businessDailyClose.findUnique({ where: { officeId_businessDate: { officeId, businessDate: dateOnly(clinicDateKey(occurredAt)) } }, select: { status: true } });
    if (close && close.status !== BusinessDailyCloseStatus.DRAFT) throw new BadRequestException('День уже отправлен или утверждён. Верните его в черновик перед изменениями');
  }

  private async findCloseForEntry(officeId: string | null, occurredAt: Date) {
    if (!officeId) return null;
    return this.prisma.businessDailyClose.findUnique({
      where: { officeId_businessDate: { officeId, businessDate: dateOnly(clinicDateKey(occurredAt)) } },
      select: { id: true, status: true, comment: true },
    });
  }

  private getCloseById(closeId: string) {
    return this.prisma.businessDailyClose.findUniqueOrThrow({ where: { id: closeId }, include: closeInclude });
  }
}

type DailyLine = {
  lineKey: string;
  titleSnapshot: string;
  paymentType: PaymentType;
  cashboxId: string | null;
  paymentMethodId: string | null;
  systemAmount: Prisma.Decimal;
  inflowAmount: Prisma.Decimal;
  outflowAmount: Prisma.Decimal;
};

function addDailyLine(
  rows: Map<string, DailyLine>,
  item: { type: PaymentType; cashboxId: string | null; paymentMethodId: string | null; cashbox?: { title: string } | null; paymentMethod?: { title: string } | null },
  amount: Prisma.Decimal,
) {
  const lineKey = `${item.cashboxId ?? 'no-cashbox'}:${item.paymentMethodId ?? `type-${item.type}`}`;
  const methodTitle = item.paymentMethod?.title ?? (item.type === PaymentType.OTHER ? 'Способ не указан' : paymentTypeTitle(item.type));
  const titleSnapshot = `${methodTitle} · ${item.cashbox?.title ?? 'касса не указана'}`;
  const row = rows.get(lineKey) ?? {
    lineKey,
    titleSnapshot,
    paymentType: item.type,
    cashboxId: item.cashboxId,
    paymentMethodId: item.paymentMethodId,
    systemAmount: decimal(0),
    inflowAmount: decimal(0),
    outflowAmount: decimal(0),
  };
  row.systemAmount = row.systemAmount.plus(amount);
  if (amount.greaterThanOrEqualTo(0)) row.inflowAmount = row.inflowAmount.plus(amount);
  else row.outflowAmount = row.outflowAmount.plus(amount.abs());
  rows.set(lineKey, row);
}

function attachDailyLineBreakdown<T extends { lines: Array<{ lineKey: string; systemAmount: Prisma.Decimal }> }>(close: T, snapshotLines: DailyLine[]) {
  const snapshotMap = new Map(snapshotLines.map((line) => [line.lineKey, line]));
  return {
    ...close,
    lines: close.lines.map((line) => {
      const snapshot = snapshotMap.get(line.lineKey);
      const snapshotMatches = snapshot?.systemAmount.equals(line.systemAmount) ?? false;
      const amount = decimal(line.systemAmount);
      return {
        ...line,
        inflowAmount: snapshotMatches ? snapshot!.inflowAmount : amount.greaterThanOrEqualTo(0) ? amount : decimal(0),
        outflowAmount: snapshotMatches ? snapshot!.outflowAmount : amount.lessThan(0) ? amount.abs() : decimal(0),
      };
    }),
  };
}

function aggregateBusinessDaily(
  input: {
    bills: Array<{ createdAt: Date; totalAmount: Prisma.Decimal }>;
    payments: Array<{ paidAt: Date; amount: Prisma.Decimal }>;
    movements: Array<{ createdAt: Date; type: StockMovementType; quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null; stockBatch: { purchasePrice: Prisma.Decimal } | null; billItemId: string | null; visitId: string | null; saleId: string | null }>;
    entries: Array<{ occurredAt: Date; type: BusinessCategoryType; amount: Prisma.Decimal; category: { affectsProfit: boolean; code: string } }>;
    supplierPayments: Array<{ paidAt: Date; amount: Prisma.Decimal }>;
  },
  offsetMinutes: number,
) {
  const rows = new Map<string, { date: string; accruedRevenue: number; cashIncome: number; cashExpense: number; profitExpense: number; salaryExpense: number; costOfGoods: number }>();
  const row = (date: Date) => {
    const key = clinicDateKey(date, offsetMinutes);
    const value = rows.get(key) ?? { date: key, accruedRevenue: 0, cashIncome: 0, cashExpense: 0, profitExpense: 0, salaryExpense: 0, costOfGoods: 0 };
    rows.set(key, value);
    return value;
  };
  input.bills.forEach((item) => { row(item.createdAt).accruedRevenue += number(item.totalAmount); });
  input.payments.forEach((item) => { const value = number(item.amount); if (value >= 0) row(item.paidAt).cashIncome += value; else row(item.paidAt).cashExpense += -value; });
  input.supplierPayments.forEach((item) => { row(item.paidAt).cashExpense += number(item.amount); });
  input.entries.forEach((item) => {
    const value = number(item.amount);
    if (item.type === BusinessCategoryType.INCOME) {
      row(item.occurredAt).cashIncome += value;
      if (item.category.affectsProfit) row(item.occurredAt).accruedRevenue += value;
    } else {
      row(item.occurredAt).cashExpense += value;
      if (item.category.code === 'daily_salary') row(item.occurredAt).salaryExpense += value;
      else if (item.category.affectsProfit) row(item.occurredAt).profitExpense += value;
    }
  });
  input.movements.forEach((item) => {
    const documentedCorrection = item.type === StockMovementType.CORRECTION && Boolean(item.billItemId || item.visitId || item.saleId);
    if (item.type === StockMovementType.CORRECTION && !documentedCorrection) return;
    row(item.createdAt).costOfGoods += Math.max(-number(item.quantity) * number(item.unitCost ?? item.stockBatch?.purchasePrice), 0);
  });
  return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date)).map((item) => ({
    ...item,
    operatingProfitAfterManualExpenses: item.accruedRevenue - item.costOfGoods - item.profitExpense - item.salaryExpense,
    cashNet: item.cashIncome - item.cashExpense,
  }));
}

function aggregateCategories(entries: Array<{ categoryId: string; amount: Prisma.Decimal; category: { title: string; groupCode: string; affectsProfit: boolean } }>) {
  const rows = new Map<string, { categoryId: string; title: string; groupCode: string; affectsProfit: boolean; amount: number }>();
  for (const entry of entries) {
    const row = rows.get(entry.categoryId) ?? { categoryId: entry.categoryId, title: entry.category.title, groupCode: entry.category.groupCode, affectsProfit: entry.category.affectsProfit, amount: 0 };
    row.amount += number(entry.amount);
    rows.set(entry.categoryId, row);
  }
  return [...rows.values()].sort((left, right) => right.amount - left.amount);
}

function paymentTypeTitle(type: PaymentType) {
  return { CASH: 'Наличные', CARD: 'Банковская карта', BANK_TRANSFER: 'Перевод на счёт', DEPOSIT: 'Депозит владельца', OTHER: 'Другой способ' }[type];
}

function has(actor: BusinessActor, permission: string) {
  return actor.permissions.includes('*') || actor.permissions.includes(permission);
}

function clean(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function appendComment(existing: string | null, reason: string) {
  return [existing?.trim(), `Возвращено директором: ${reason.trim()}`].filter(Boolean).join('\n');
}

function reopenCloseData(existingComment: string | null, reason: string) {
  return {
    status: BusinessDailyCloseStatus.DRAFT,
    submittedById: null,
    submittedAt: null,
    approvedById: null,
    approvedAt: null,
    comment: [existingComment?.trim(), `Автоматически возвращено в черновик: ${reason.trim()}`].filter(Boolean).join('\n'),
  } satisfies Prisma.BusinessDailyCloseUncheckedUpdateInput;
}

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function number(value: Prisma.Decimal.Value | null | undefined) {
  return Number(value ?? 0);
}

function sum(values: Prisma.Decimal.Value[]) {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(value), decimal(0));
}

function total<T>(values: T[], resolve: (item: T) => Prisma.Decimal.Value) {
  return values.reduce((result, item) => result + number(resolve(item)), 0);
}

function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Дата должна быть в формате ГГГГ-ММ-ДД');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Указана некорректная дата');
  return date;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function calculateManagementResult(input: {
  accruedSystemRevenue: number;
  profitIncome: number;
  costOfGoods: number;
  payrollExpense: number;
  dailySalaryExpense: number;
  operatingExpenses: number;
  cashIncome: number;
  refunds: number;
  manualIncome: number;
  manualExpense: number;
  supplierOutflow: number;
}) {
  const accruedRevenue = input.accruedSystemRevenue + input.profitIncome;
  const grossProfit = accruedRevenue - input.costOfGoods;
  const operatingProfit = grossProfit - input.payrollExpense - input.dailySalaryExpense - input.operatingExpenses;
  const cashNet = input.cashIncome - input.refunds + input.manualIncome - input.manualExpense - input.supplierOutflow;
  return {
    accruedRevenue,
    grossProfit,
    operatingProfit,
    marginPercent: accruedRevenue > 0 ? operatingProfit / accruedRevenue * 100 : 0,
    cashNet,
  };
}
