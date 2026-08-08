import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, PaymentStatus, PayrollAdjustmentType, PayrollPeriodStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';
import { CreatePayrollManualAccrualDto } from './dto/create-payroll-manual-accrual.dto';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpsertPayrollProfileDto } from './dto/upsert-payroll-profile.dto';

type PayrollSourceBill = {
  id: string;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  visit: { employeeId: string | null; status: string } | null;
  sale: { employeeId: string | null } | null;
  items: Array<{
    serviceId: string | null;
    productId: string | null;
    totalAmount: Prisma.Decimal;
  }>;
};

type PayrollProfileWithRules = Prisma.PayrollProfileGetPayload<{
  include: {
    employee: { select: { id: true; fullName: true } };
    serviceRules: true;
    productRules: true;
  };
}>;

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getResources() {
    const [employees, services, products] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where: { status: EmployeeStatus.ACTIVE },
        orderBy: { fullName: 'asc' },
        include: {
          payrollProfile: {
            include: {
              serviceRules: { orderBy: { service: { title: 'asc' } }, include: { service: { select: { id: true, title: true } } } },
              productRules: { orderBy: { product: { title: 'asc' } }, include: { product: { select: { id: true, title: true } } } },
            },
          },
        },
      }),
      this.prisma.service.findMany({ where: { isActive: true }, orderBy: { title: 'asc' }, select: { id: true, title: true }, take: 500 }),
      this.prisma.product.findMany({ where: { isActive: true }, orderBy: { title: 'asc' }, select: { id: true, title: true }, take: 1000 }),
    ]);

    return { employees, services, products };
  }

  async upsertProfile(employeeId: string, dto: UpsertPayrollProfileDto, actorId: string) {
    await this.ensureEmployeeExists(employeeId);
    ensureUnique(dto.serviceRules?.map((item) => item.serviceId) ?? [], 'Услуга повторяется в индивидуальных правилах');
    ensureUnique(dto.productRules?.map((item) => item.productId) ?? [], 'Товар повторяется в индивидуальных правилах');

    const profile = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.payrollProfile.upsert({
        where: { employeeId },
        update: {
          fixedAmount: dto.fixedAmount,
          shiftRate: dto.shiftRate,
          servicePercent: dto.servicePercent,
          productPercent: dto.productPercent,
          isActive: dto.isActive ?? true,
        },
        create: {
          employeeId,
          fixedAmount: dto.fixedAmount,
          shiftRate: dto.shiftRate,
          servicePercent: dto.servicePercent,
          productPercent: dto.productPercent,
          isActive: dto.isActive ?? true,
        },
      });

      await tx.payrollServiceRule.deleteMany({ where: { profileId: saved.id } });
      await tx.payrollProductRule.deleteMany({ where: { profileId: saved.id } });

      if (dto.serviceRules?.length) {
        await tx.payrollServiceRule.createMany({
          data: dto.serviceRules.map((rule) => ({ profileId: saved.id, serviceId: rule.serviceId, percent: rule.percent })),
        });
      }
      if (dto.productRules?.length) {
        await tx.payrollProductRule.createMany({
          data: dto.productRules.map((rule) => ({ profileId: saved.id, productId: rule.productId, percent: rule.percent })),
        });
      }

      return tx.payrollProfile.findUniqueOrThrow({
        where: { id: saved.id },
        include: { serviceRules: true, productRules: true },
      });
    });

    await this.auditService.log({
      actorId,
      action: 'payroll.profile.save',
      entityType: 'PayrollProfile',
      entityId: profile.id,
      metadata: { employeeId },
    });

    return profile;
  }

  listPeriods() {
    return this.prisma.payrollPeriod.findMany({
      orderBy: { startsAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        _count: { select: { entries: true, adjustments: true } },
      },
      take: 100,
    });
  }

  async createPeriod(dto: CreatePayrollPeriodDto, actorId: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    validatePeriodRange(startsAt, endsAt);

    const overlap = await this.prisma.payrollPeriod.findFirst({
      where: { startsAt: { lte: endsAt }, endsAt: { gte: startsAt } },
      select: { id: true, title: true },
    });
    if (overlap) {
      throw new BadRequestException(`Расчётный период пересекается с «${overlap.title}»`);
    }

    const period = await this.prisma.payrollPeriod.create({
      data: { title: dto.title.trim(), startsAt, endsAt, createdById: actorId },
    });
    const calculated = await this.recalculatePeriod(period.id, actorId, false);

    await this.auditService.log({
      actorId,
      action: 'payroll.period.create',
      entityType: 'PayrollPeriod',
      entityId: period.id,
      metadata: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    });
    return calculated;
  }

  async getPeriod(periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        entries: { orderBy: { employeeName: 'asc' } },
        adjustments: {
          orderBy: { createdAt: 'asc' },
          include: {
            employee: { select: { id: true, fullName: true } },
            createdBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!period) throw new NotFoundException('Расчётный период не найден');
    return period;
  }

  async recalculatePeriod(periodId: string, actorId: string, writeAudit = true) {
    const calculation = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payrollPeriod.updateMany({
        where: { id: periodId, status: PayrollPeriodStatus.DRAFT },
        data: { updatedAt: new Date() },
      });
      if (!claimed.count) {
        const exists = await tx.payrollPeriod.findUnique({ where: { id: periodId }, select: { id: true } });
        if (!exists) throw new NotFoundException('Расчётный период не найден');
        throw new BadRequestException('Утверждённый расчёт нельзя пересчитывать');
      }
      const period = await tx.payrollPeriod.findUniqueOrThrow({ where: { id: periodId } });
      const entries = await this.calculateEntries(period.id, period.startsAt, period.endsAt, tx);
      const totalAmount = entries.reduce((total, entry) => total.plus(entry.totalAmount), decimal(0));
      await tx.payrollEntry.deleteMany({ where: { periodId } });
      for (const entry of entries) {
        await tx.payrollEntry.create({ data: { periodId, ...entry } });
      }
      await tx.payrollPeriod.update({ where: { id: periodId }, data: { totalAmount } });
      return { entries: entries.length, totalAmount };
    });

    if (writeAudit) {
      await this.auditService.log({
        actorId,
        action: 'payroll.period.recalculate',
        entityType: 'PayrollPeriod',
        entityId: periodId,
        metadata: { entries: calculation.entries, totalAmount: calculation.totalAmount.toString() },
      });
    }
    return this.getPeriod(periodId);
  }

  async addAdjustment(periodId: string, dto: CreatePayrollAdjustmentDto, actorId: string) {
    return this.createPayrollAmount(periodId, {
      employeeId: dto.employeeId,
      amount: dto.amount,
      reason: dto.reason,
      type: PayrollAdjustmentType.ADJUSTMENT,
    }, actorId, 'payroll.adjustment.create');
  }

  async addManualAccrual(periodId: string, dto: CreatePayrollManualAccrualDto, actorId: string) {
    return this.createPayrollAmount(periodId, {
      employeeId: dto.employeeId,
      amount: dto.amount,
      reason: dto.reason,
      type: PayrollAdjustmentType.MANUAL_SALARY,
      accruedAt: new Date(dto.accruedAt),
    }, actorId, 'payroll.manual_salary.create');
  }

  private async createPayrollAmount(
    periodId: string,
    input: {
      employeeId: string;
      amount: number;
      reason: string;
      type: PayrollAdjustmentType;
      accruedAt?: Date;
    },
    actorId: string,
    auditAction: string,
  ) {
    await this.ensureEmployeeExists(input.employeeId);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payrollPeriod.updateMany({
        where: { id: periodId, status: PayrollPeriodStatus.DRAFT },
        data: { updatedAt: new Date() },
      });
      if (!claimed.count) {
        const exists = await tx.payrollPeriod.findUnique({ where: { id: periodId }, select: { id: true } });
        if (!exists) throw new NotFoundException('Расчётный период не найден');
        throw new BadRequestException('Утверждённый расчёт нельзя изменять');
      }
      const period = await tx.payrollPeriod.findUniqueOrThrow({ where: { id: periodId } });
      if (input.accruedAt && (input.accruedAt < period.startsAt || input.accruedAt > period.endsAt)) {
        throw new BadRequestException('Дата начисления должна входить в расчётный период');
      }
      await tx.payrollAdjustment.create({
        data: {
          periodId,
          employeeId: input.employeeId,
          type: input.type,
          amount: input.amount,
          reason: input.reason.trim(),
          accruedAt: input.accruedAt,
          createdById: actorId,
        },
      });
      const entries = await this.calculateEntries(period.id, period.startsAt, period.endsAt, tx);
      const totalAmount = entries.reduce((total, entry) => total.plus(entry.totalAmount), decimal(0));
      await tx.payrollEntry.deleteMany({ where: { periodId } });
      for (const entry of entries) {
        await tx.payrollEntry.create({ data: { periodId, ...entry } });
      }
      await tx.payrollPeriod.update({ where: { id: periodId }, data: { totalAmount } });
    });
    await this.auditService.log({
      actorId,
      action: auditAction,
      entityType: 'PayrollPeriod',
      entityId: periodId,
      metadata: {
        employeeId: input.employeeId,
        amount: input.amount,
        reason: input.reason.trim(),
        type: input.type,
        accruedAt: input.accruedAt?.toISOString() ?? null,
      },
    });
    return this.getPeriod(periodId);
  }

  async approvePeriod(periodId: string, actorId: string) {
    const result = await this.prisma.payrollPeriod.updateMany({
      where: { id: periodId, status: PayrollPeriodStatus.DRAFT },
      data: { status: PayrollPeriodStatus.APPROVED, approvedById: actorId, approvedAt: new Date() },
    });
    if (!result.count) {
      const exists = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Расчётный период не найден');
      throw new BadRequestException('Расчёт уже утверждён');
    }
    await this.auditService.log({
      actorId,
      action: 'payroll.period.approve',
      entityType: 'PayrollPeriod',
      entityId: periodId,
    });
    return this.getPeriod(periodId);
  }

  private async calculateEntries(
    periodId: string,
    startsAt: Date,
    endsAt: Date,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const [profiles, adjustments] = await Promise.all([
      client.payrollProfile.findMany({
        where: { isActive: true, employee: { status: EmployeeStatus.ACTIVE } },
        include: {
          employee: { select: { id: true, fullName: true } },
          serviceRules: true,
          productRules: true,
        },
        orderBy: { employee: { fullName: 'asc' } },
      }),
      client.payrollAdjustment.findMany({
        where: { periodId },
        select: {
          employeeId: true,
          amount: true,
          type: true,
          employee: { select: { id: true, fullName: true } },
        },
      }),
    ]);
    const employeeIds = profiles.map((profile) => profile.employeeId);
    let shifts: Array<{ employeeId: string }> = [];
    let bills: PayrollSourceBill[] = [];
    if (employeeIds.length) {
      [shifts, bills] = await Promise.all([
        client.employeeShift.findMany({
          where: { employeeId: { in: employeeIds }, isActive: true, startsAt: { gte: startsAt }, endsAt: { lte: endsAt } },
          select: { employeeId: true },
        }),
        client.bill.findMany({
          where: {
            createdAt: { gte: startsAt, lte: endsAt },
            status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
            OR: [
              { visit: { employeeId: { in: employeeIds }, status: 'COMPLETED' } },
              { sale: { employeeId: { in: employeeIds } } },
            ],
          },
          select: {
            id: true,
            totalAmount: true,
            paidAmount: true,
            visit: { select: { employeeId: true, status: true } },
            sale: { select: { employeeId: true } },
            items: { select: { serviceId: true, productId: true, totalAmount: true } },
          },
        }),
      ]);
    }

    const entries: Array<ReturnType<typeof calculateEmployeePayroll> | ReturnType<typeof calculateManualPayrollEntry>> =
      profiles.map((profile) => calculateEmployeePayroll(profile, shifts, bills, adjustments));
    const profileEmployeeIds = new Set(employeeIds);
    const manualEmployees = new Map(adjustments
      .filter((adjustment) => !profileEmployeeIds.has(adjustment.employeeId))
      .map((adjustment) => [adjustment.employeeId, adjustment.employee]));
    for (const [employeeId, employee] of manualEmployees) {
      entries.push(calculateManualPayrollEntry(employee, adjustments.filter((item) => item.employeeId === employeeId)));
    }

    return entries.sort((left, right) => left.employeeName.localeCompare(right.employeeName, 'ru'));
  }

  private async ensureEmployeeExists(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) throw new NotFoundException('Сотрудник не найден');
  }
}

export function calculateEmployeePayroll(
  profile: PayrollProfileWithRules,
  shifts: Array<{ employeeId: string }>,
  bills: PayrollSourceBill[],
  adjustments: Array<{ employeeId: string; amount: Prisma.Decimal; type?: PayrollAdjustmentType }>,
) {
  const shiftCount = shifts.filter((shift) => shift.employeeId === profile.employeeId).length;
  const fixedAmount = decimal(profile.fixedAmount);
  const shiftAmount = decimal(profile.shiftRate).times(shiftCount);
  const serviceRules = new Map(profile.serviceRules.map((rule) => [rule.serviceId, number(rule.percent)]));
  const productRules = new Map(profile.productRules.map((rule) => [rule.productId, number(rule.percent)]));
  let serviceRevenue = decimal(0);
  let serviceAmount = decimal(0);
  let productRevenue = decimal(0);
  let productAmount = decimal(0);
  let sourceBills = 0;

  for (const bill of bills) {
    const employeeId = bill.visit?.employeeId ?? bill.sale?.employeeId ?? null;
    if (employeeId !== profile.employeeId) continue;
    const paidShare = resolvePaidShare(bill.totalAmount, bill.paidAmount);
    if (!paidShare) continue;
    sourceBills += 1;

    for (const item of bill.items) {
      const revenue = decimal(item.totalAmount).times(paidShare);
      if (item.serviceId) {
        const percent = serviceRules.get(item.serviceId) ?? number(profile.servicePercent);
        serviceRevenue = serviceRevenue.plus(revenue);
        serviceAmount = serviceAmount.plus(revenue.times(percent).dividedBy(100));
      } else if (item.productId) {
        const percent = productRules.get(item.productId) ?? number(profile.productPercent);
        productRevenue = productRevenue.plus(revenue);
        productAmount = productAmount.plus(revenue.times(percent).dividedBy(100));
      }
    }
  }

  const employeeAdjustments = adjustments.filter((item) => item.employeeId === profile.employeeId);
  const manualAmount = employeeAdjustments
    .filter((item) => item.type === PayrollAdjustmentType.MANUAL_SALARY)
    .reduce((total, item) => total.plus(item.amount), decimal(0));
  const adjustmentAmount = employeeAdjustments
    .filter((item) => item.type !== PayrollAdjustmentType.MANUAL_SALARY)
    .reduce((total, item) => total.plus(item.amount), decimal(0));
  const totalAmount = fixedAmount.plus(shiftAmount).plus(serviceAmount).plus(productAmount).plus(manualAmount).plus(adjustmentAmount);

  return {
    employeeId: profile.employeeId,
    employeeName: profile.employee.fullName,
    fixedAmount,
    shiftCount,
    shiftAmount,
    serviceRevenue,
    serviceAmount,
    productRevenue,
    productAmount,
    manualAmount,
    adjustmentAmount,
    totalAmount,
    snapshot: {
      version: 2,
      profileId: profile.id,
      fixedAmount: fixedAmount.toString(),
      shiftRate: decimal(profile.shiftRate).toString(),
      servicePercent: decimal(profile.servicePercent).toString(),
      productPercent: decimal(profile.productPercent).toString(),
      serviceRules: profile.serviceRules.map((rule) => ({ serviceId: rule.serviceId, percent: rule.percent.toString() })),
      productRules: profile.productRules.map((rule) => ({ productId: rule.productId, percent: rule.percent.toString() })),
      sourceBills,
      calculatedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject,
  };
}

export function calculateManualPayrollEntry(
  employee: { id: string; fullName: string },
  adjustments: Array<{ employeeId: string; amount: Prisma.Decimal; type?: PayrollAdjustmentType }>,
) {
  const manualAmount = adjustments
    .filter((item) => item.type === PayrollAdjustmentType.MANUAL_SALARY)
    .reduce((total, item) => total.plus(item.amount), decimal(0));
  const adjustmentAmount = adjustments
    .filter((item) => item.type !== PayrollAdjustmentType.MANUAL_SALARY)
    .reduce((total, item) => total.plus(item.amount), decimal(0));
  const zero = decimal(0);

  return {
    employeeId: employee.id,
    employeeName: employee.fullName,
    fixedAmount: zero,
    shiftCount: 0,
    shiftAmount: zero,
    serviceRevenue: zero,
    serviceAmount: zero,
    productRevenue: zero,
    productAmount: zero,
    manualAmount,
    adjustmentAmount,
    totalAmount: manualAmount.plus(adjustmentAmount),
    snapshot: {
      version: 2,
      profileId: null,
      manualOnly: true,
      sourceBills: 0,
      calculatedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject,
  };
}

export function resolvePaidShare(totalAmount: Prisma.Decimal | number, paidAmount: Prisma.Decimal | number) {
  const total = number(totalAmount);
  if (total <= 0) return 0;
  return Math.min(Math.max(number(paidAmount) / total, 0), 1);
}

function validatePeriodRange(startsAt: Date, endsAt: Date) {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
    throw new BadRequestException('Дата окончания должна быть позже даты начала');
  }
  const maxDays = 366;
  if (endsAt.getTime() - startsAt.getTime() > maxDays * 86_400_000) {
    throw new BadRequestException('Расчётный период не может быть длиннее года');
  }
}

function ensureUnique(values: string[], message: string) {
  if (new Set(values).size !== values.length) throw new BadRequestException(message);
}

function decimal(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value);
}

function number(value: Prisma.Decimal | number | string) {
  return Number(value);
}
