import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  EmployeeStatus,
  PaymentStatus,
  Prisma,
  StockMovementType,
  VisitStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { clinicDateKey, resolveReportRange } from './report-range';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    const dateWhere = { gte: range.start, lte: range.end };
    const employeeVisitWhere = query.employeeId ? { employeeId: query.employeeId } : {};
    const employeeBillWhere = query.employeeId ? { visit: { employeeId: query.employeeId } } : {};
    const now = new Date();
    const expiresSoon = new Date(now.getTime() + 30 * 86_400_000);

    const [
      bills,
      payments,
      debtBills,
      positiveBalances,
      visits,
      completedVisits,
      overdueVisitAlerts,
      issuedOverdueNotifications,
      appointments,
      newOwners,
      vaccinationsAdministered,
      vaccinationDueCandidates,
      identifiedAnimals,
      stockBatches,
      stockMovements,
      supplyInvoices,
      employees,
    ] = await Promise.all([
      this.prisma.bill.findMany({
        where: {
          createdAt: dateWhere,
          status: { not: PaymentStatus.CANCELLED },
          ...employeeBillWhere,
        },
        select: {
          id: true,
          createdAt: true,
          totalAmount: true,
          paidAmount: true,
          owner: { select: { id: true, fullName: true } },
          visit: {
            select: {
              employee: { select: { id: true, fullName: true, position: true } },
            },
          },
          items: {
            select: {
              serviceId: true,
              productId: true,
              title: true,
              quantity: true,
              discount: true,
              totalAmount: true,
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          paidAt: dateWhere,
          ...(query.employeeId ? { bill: { visit: { employeeId: query.employeeId } } } : {}),
        },
        select: {
          id: true,
          paidAt: true,
          amount: true,
          type: true,
          paymentMethod: { select: { id: true, title: true } },
          cashbox: { select: { id: true, title: true } },
        },
      }),
      this.prisma.bill.findMany({
        where: {
          status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
          ...employeeBillWhere,
        },
        select: {
          id: true,
          createdAt: true,
          dueAt: true,
          totalAmount: true,
          paidAmount: true,
          owner: { select: { id: true, fullName: true, phone: true } },
        },
      }),
      this.prisma.owner.aggregate({ where: { balance: { gt: 0 } }, _sum: { balance: true } }),
      this.prisma.visit.findMany({
        where: { startedAt: dateWhere, ...employeeVisitWhere },
        select: {
          id: true,
          ownerId: true,
          status: true,
          startedAt: true,
          totalAmount: true,
          employee: { select: { id: true, fullName: true, position: true } },
        },
      }),
      this.prisma.visit.findMany({
        where: {
          status: VisitStatus.COMPLETED,
          completedAt: dateWhere,
          hospitalBoxId: null,
          ...employeeVisitWhere,
        },
        select: {
          id: true,
          completedAt: true,
          employee: { select: { id: true, fullName: true, position: true } },
        },
      }),
      this.prisma.visitOverdueAlert.findMany({
        where: {
          overdueAt: dateWhere,
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        },
        select: {
          id: true,
          visitId: true,
          overdueAt: true,
          createdAt: true,
          employee: { select: { id: true, fullName: true, position: true } },
        },
      }),
      this.prisma.visitOverdueAlert.findMany({
        where: {
          createdAt: dateWhere,
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        },
        select: {
          id: true,
          visitId: true,
          overdueAt: true,
          createdAt: true,
          employee: { select: { id: true, fullName: true, position: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: { startsAt: dateWhere, ...employeeVisitWhere },
        select: { id: true, status: true, startsAt: true },
      }),
      this.prisma.owner.count({ where: { createdAt: dateWhere } }),
      this.prisma.vaccination.findMany({
        where: { vaccinatedAt: dateWhere },
        orderBy: { vaccinatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          vaccinatedAt: true,
          vaccineBatch: true,
          vaccineSeries: true,
          animal: {
            select: {
              id: true,
              nickname: true,
              species: true,
              microchip: true,
              owner: { select: { id: true, fullName: true, phone: true } },
            },
          },
        },
      }),
      this.prisma.vaccination.findMany({
        where: { expiresAt: { not: null }, animal: { archivedAt: null } },
        orderBy: { expiresAt: 'desc' },
        select: {
          id: true,
          title: true,
          expiresAt: true,
          ownerReminderEnabled: true,
          animal: { select: { id: true, nickname: true, owner: { select: { id: true, fullName: true, phone: true } } } },
        },
      }),
      this.prisma.animal.findMany({
        where: { microchip: { not: null }, archivedAt: null },
        orderBy: { nickname: 'asc' },
        select: {
          id: true,
          nickname: true,
          species: true,
          breed: true,
          microchip: true,
          owner: { select: { id: true, fullName: true, phone: true } },
        },
      }),
      this.prisma.stockBatch.findMany({
        where: { rest: { gt: 0 } },
        select: {
          id: true,
          rest: true,
          purchasePrice: true,
          expiresAt: true,
          series: true,
          product: { select: { id: true, title: true, retailPrice: true, minStock: true, stockUnit: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          createdAt: dateWhere,
          type: { in: [StockMovementType.SALE, StockMovementType.VISIT_USAGE, StockMovementType.CORRECTION] },
          stockBatchId: { not: null },
          ...(query.employeeId ? { visit: { employeeId: query.employeeId } } : {}),
        },
        select: {
          type: true,
          quantity: true,
          unitCost: true,
          billItemId: true,
          visitId: true,
          saleId: true,
          stockBatch: { select: { purchasePrice: true } },
        },
      }),
      this.prisma.supplyInvoice.findMany({
        where: { suppliedAt: dateWhere },
        select: { id: true, totalAmount: true },
      }),
      this.prisma.employee.findMany({
        where: { status: EmployeeStatus.ACTIVE },
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, position: true },
      }),
    ]);

    const billedAmount = sum(bills, (item) => item.totalAmount);
    const receivedAmount = sum(payments.filter((item) => number(item.amount) > 0), (item) => item.amount);
    const refundedAmount = -sum(payments.filter((item) => number(item.amount) < 0), (item) => item.amount);
    const paidAmount = receivedAmount - refundedAmount;
    const debtors = debtBills
      .map((bill) => ({
        billId: bill.id,
        ownerId: bill.owner?.id ?? null,
        ownerName: bill.owner?.fullName ?? 'Владелец не указан',
        phone: bill.owner?.phone ?? null,
        createdAt: bill.createdAt,
        dueAt: bill.dueAt,
        debt: Math.max(number(bill.totalAmount) - number(bill.paidAmount), 0),
      }))
      .filter((item) => item.debt > 0)
      .sort((left, right) => right.debt - left.debt);
    const debtAmount = sum(debtors, (item) => item.debt);

    const itemRows = aggregateBillItems(bills);
    const employeeRows = aggregateEmployees(
      employees,
      visits,
      completedVisits,
      overdueVisitAlerts,
      issuedOverdueNotifications,
      bills,
    );
    const paymentMethods = aggregatePayments(payments);
    const stock = aggregateStock(stockBatches, now, expiresSoon);
    const dueVaccinations = resolveDueVaccinations(vaccinationDueCandidates, now, expiresSoon);
    const costOfGoods = Math.max(
      stockMovements.reduce(
        (total, movement) => {
          const isDocumentedCorrection = movement.type === StockMovementType.CORRECTION
            && Boolean(movement.billItemId || movement.visitId || movement.saleId);
          if (movement.type === StockMovementType.CORRECTION && !isDocumentedCorrection) return total;
          return total - number(movement.quantity) * number(movement.unitCost ?? movement.stockBatch?.purchasePrice);
        },
        0,
      ),
      0,
    );
    const grossProfit = billedAmount - costOfGoods;

    return {
      generatedAt: new Date().toISOString(),
      range: { from: range.from, to: range.to },
      filters: { employeeId: query.employeeId ?? null },
      employeeOptions: employees,
      finance: {
        billedAmount,
        receivedAmount,
        refundedAmount,
        paidAmount,
        debtAmount,
        depositsAmount: number(positiveBalances._sum.balance),
        averageBill: bills.length ? billedAmount / bills.length : 0,
        billsCount: bills.length,
        paymentsCount: payments.length,
        debtorsCount: debtors.length,
        supplyPurchasesAmount: sum(supplyInvoices, (item) => item.totalAmount),
        paymentMethods,
        debtors: debtors.slice(0, 100),
      },
      traffic: {
        visitsTotal: visits.length,
        visitsCompleted: completedVisits.length,
        visitsOverdue: overdueVisitAlerts.length,
        overdueNotifications: issuedOverdueNotifications.length,
        visitsCancelled: visits.filter((item) => item.status === VisitStatus.CANCELLED).length,
        appointmentsTotal: appointments.length,
        appointmentsCompleted: appointments.filter((item) => item.status === AppointmentStatus.COMPLETED).length,
        appointmentsCancelled: appointments.filter((item) => item.status === AppointmentStatus.CANCELLED).length,
        appointmentsNoShow: appointments.filter((item) => item.status === AppointmentStatus.NO_SHOW).length,
        uniqueOwners: new Set(visits.map((item) => item.ownerId)).size,
        newOwners,
        daily: aggregateDaily(
          bills,
          payments,
          visits,
          completedVisits,
          overdueVisitAlerts,
          issuedOverdueNotifications,
          range,
        ),
      },
      sales: itemRows,
      employees: employeeRows,
      vaccinations: {
        administered: vaccinationsAdministered.length,
        administeredByTitle: aggregateTitles(vaccinationsAdministered),
        administeredBySpecies: aggregateSpecies(vaccinationsAdministered),
        administeredItems: vaccinationsAdministered.slice(0, 500),
        rabiesItems: vaccinationsAdministered.filter((item) => isRabiesVaccination(item.title)).slice(0, 500),
        identifiedAnimals: identifiedAnimals.filter((item) => item.microchip?.trim()).slice(0, 1000),
        upcoming: dueVaccinations.upcoming.length,
        overdue: dueVaccinations.overdue.length,
        upcomingItems: dueVaccinations.upcoming.slice(0, 100),
        overdueItems: dueVaccinations.overdue.slice(0, 100),
      },
      stock,
      profit: {
        revenue: billedAmount,
        costOfGoods,
        grossProfit,
        marginPercent: billedAmount > 0 ? grossProfit / billedAmount * 100 : 0,
        note: 'Валовая прибыль до зарплат, аренды, налогов и прочих расходов.',
      },
    };
  }
}

function aggregateBillItems(bills: ReportBill[]) {
  const rows = new Map<string, ReportSalesRow>();
  for (const bill of bills) {
    for (const item of bill.items) {
      const kind = item.productId ? 'product' : item.serviceId ? 'service' : 'other';
      const key = `${kind}:${item.productId ?? item.serviceId ?? item.title.toLocaleLowerCase('ru-RU')}`;
      const row = rows.get(key) ?? {
        key,
        kind,
        title: item.title,
        quantity: 0,
        revenue: 0,
        discount: 0,
        lines: 0,
      };
      row.quantity += number(item.quantity);
      row.revenue += number(item.totalAmount);
      row.discount += number(item.discount);
      row.lines += 1;
      rows.set(key, row);
    }
  }

  const all = [...rows.values()].sort((left, right) => right.revenue - left.revenue);
  return {
    services: all.filter((item) => item.kind === 'service'),
    products: all.filter((item) => item.kind === 'product'),
    other: all.filter((item) => item.kind === 'other'),
  };
}

function aggregateEmployees(
  employees: ReportEmployee[],
  visits: ReportVisit[],
  completedVisits: ReportCompletedVisit[],
  overdueVisitAlerts: ReportOverdueVisitAlert[],
  issuedOverdueNotifications: ReportOverdueVisitAlert[],
  bills: ReportBill[],
) {
  const rows = new Map(employees.map((employee) => [employee.id, {
    employeeId: employee.id,
    fullName: employee.fullName,
    position: employee.position,
    visits: 0,
    completedVisits: 0,
    overdueVisits: 0,
    overdueNotifications: 0,
    billedAmount: 0,
  }]));

  for (const visit of visits) {
    if (!visit.employee) continue;
    const row = rows.get(visit.employee.id) ?? {
      employeeId: visit.employee.id,
      fullName: visit.employee.fullName,
      position: visit.employee.position,
      visits: 0,
      completedVisits: 0,
      overdueVisits: 0,
      overdueNotifications: 0,
      billedAmount: 0,
    };
    row.visits += 1;
    rows.set(row.employeeId, row);
  }

  for (const visit of completedVisits) {
    if (!visit.employee) continue;
    const row = rows.get(visit.employee.id);
    if (row) row.completedVisits += 1;
  }

  for (const alert of overdueVisitAlerts) {
    if (!alert.employee) continue;
    const row = rows.get(alert.employee.id);
    if (row) row.overdueVisits += 1;
  }

  for (const notification of issuedOverdueNotifications) {
    if (!notification.employee) continue;
    const row = rows.get(notification.employee.id);
    if (row) row.overdueNotifications += 1;
  }

  for (const bill of bills) {
    const employee = bill.visit?.employee;
    if (!employee) continue;
    const row = rows.get(employee.id);
    if (row) row.billedAmount += number(bill.totalAmount);
  }

  return [...rows.values()]
    .filter((item) => item.visits > 0 || item.completedVisits > 0 || item.overdueVisits > 0 || item.billedAmount > 0)
    .sort((left, right) => right.billedAmount - left.billedAmount || right.visits - left.visits);
}

function aggregatePayments(payments: ReportPayment[]) {
  const rows = new Map<string, { key: string; title: string; received: number; refunded: number; net: number; count: number }>();
  for (const payment of payments) {
    const key = payment.paymentMethod?.id ?? payment.type;
    const row = rows.get(key) ?? {
      key,
      title: payment.paymentMethod?.title ?? paymentTypeLabel(payment.type),
      received: 0,
      refunded: 0,
      net: 0,
      count: 0,
    };
    const amount = number(payment.amount);
    if (amount >= 0) row.received += amount;
    else row.refunded += -amount;
    row.net += amount;
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((left, right) => right.net - left.net);
}

function aggregateStock(batches: ReportStockBatch[], now: Date, expiresSoon: Date) {
  const products = new Map<string, { id: string; title: string; rest: number; minStock: number | null; unit: string | null }>();
  let purchaseValue = 0;
  let retailValue = 0;
  let expiredBatches = 0;
  let expiringBatches = 0;

  for (const batch of batches) {
    const rest = number(batch.rest);
    purchaseValue += rest * number(batch.purchasePrice);
    retailValue += rest * number(batch.product.retailPrice);
    if (batch.expiresAt && batch.expiresAt < now) expiredBatches += 1;
    else if (batch.expiresAt && batch.expiresAt <= expiresSoon) expiringBatches += 1;
    const product = products.get(batch.product.id) ?? {
      id: batch.product.id,
      title: batch.product.title,
      rest: 0,
      minStock: batch.product.minStock === null ? null : number(batch.product.minStock),
      unit: batch.product.stockUnit,
    };
    product.rest += rest;
    products.set(product.id, product);
  }

  const lowStockItems = [...products.values()]
    .filter((item) => item.minStock !== null && item.rest <= item.minStock)
    .sort((left, right) => left.rest - right.rest);
  const expiryItems = batches
    .filter((batch) => batch.expiresAt && batch.expiresAt <= expiresSoon)
    .map((batch) => ({
      id: batch.id,
      productTitle: batch.product.title,
      warehouseName: batch.warehouse.name,
      series: batch.series,
      expiresAt: batch.expiresAt!,
      rest: number(batch.rest),
      unit: batch.product.stockUnit,
      purchasePrice: number(batch.purchasePrice),
      status: batch.expiresAt! < now ? 'EXPIRED' as const : 'EXPIRING' as const,
    }))
    .sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime());

  return {
    purchaseValue,
    retailValue,
    potentialMarkup: retailValue - purchaseValue,
    batches: batches.length,
    products: products.size,
    lowStock: lowStockItems.length,
    expiredBatches,
    expiringBatches,
    lowStockItems: lowStockItems.slice(0, 100),
    expiryItems: expiryItems.slice(0, 500),
  };
}

function aggregateDaily(
  bills: ReportBill[],
  payments: ReportPayment[],
  visits: ReportVisit[],
  completedVisits: ReportCompletedVisit[],
  overdueVisitAlerts: ReportOverdueVisitAlert[],
  issuedOverdueNotifications: ReportOverdueVisitAlert[],
  range: { from: string; to: string; offsetMinutes: number },
) {
  const rows = seedDailyRows(range.from, range.to);
  const getRow = (date: Date) => {
    const key = clinicDateKey(date, range.offsetMinutes);
    const row = rows.get(key) ?? emptyDailyRow(key);
    rows.set(key, row);
    return row;
  };
  bills.forEach((bill) => { getRow(bill.createdAt).billedAmount += number(bill.totalAmount); });
  payments.forEach((payment) => { getRow(payment.paidAt).paidAmount += number(payment.amount); });
  visits.forEach((visit) => { getRow(visit.startedAt).visits += 1; });
  completedVisits.forEach((visit) => {
    if (visit.completedAt) getRow(visit.completedAt).completedVisits += 1;
  });
  overdueVisitAlerts.forEach((alert) => {
    const row = getRow(alert.overdueAt);
    row.overdueVisits += 1;
  });
  issuedOverdueNotifications.forEach((notification) => {
    getRow(notification.createdAt).overdueNotifications += 1;
  });
  return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function seedDailyRows(from: string, to: string) {
  const rows = new Map<string, ReturnType<typeof emptyDailyRow>>();
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    rows.set(key, emptyDailyRow(key));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function emptyDailyRow(date: string) {
  return {
    date,
    billedAmount: 0,
    paidAmount: 0,
    visits: 0,
    completedVisits: 0,
    overdueVisits: 0,
    overdueNotifications: 0,
  };
}

function aggregateTitles(items: Array<{ title: string }>) {
  const rows = new Map<string, number>();
  items.forEach((item) => rows.set(item.title, (rows.get(item.title) ?? 0) + 1));
  return [...rows.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((left, right) => right.count - left.count);
}

function aggregateSpecies(items: Array<{ animal: { species: string | null } }>) {
  const rows = new Map<string, number>();
  items.forEach((item) => {
    const species = item.animal.species?.trim() || 'Вид не указан';
    rows.set(species, (rows.get(species) ?? 0) + 1);
  });
  return [...rows.entries()]
    .map(([species, count]) => ({ species, count }))
    .sort((left, right) => right.count - left.count || left.species.localeCompare(right.species, 'ru'));
}

function isRabiesVaccination(title: string) {
  return title.toLocaleLowerCase('ru-RU').includes('бешен');
}

function resolveDueVaccinations<T extends { title: string; expiresAt: Date | null; animal: { id: string } }>(
  items: T[],
  now: Date,
  expiresSoon: Date,
) {
  const latest = new Map<string, T>();
  for (const item of items) {
    const key = `${item.animal.id}:${item.title.trim().toLocaleLowerCase('ru-RU')}`;
    if (!latest.has(key)) latest.set(key, item);
  }
  const current = [...latest.values()];
  return {
    upcoming: current
      .filter((item) => item.expiresAt && item.expiresAt >= now && item.expiresAt <= expiresSoon)
      .sort((left, right) => Number(left.expiresAt) - Number(right.expiresAt)),
    overdue: current
      .filter((item) => item.expiresAt && item.expiresAt < now)
      .sort((left, right) => Number(right.expiresAt) - Number(left.expiresAt)),
  };
}

function paymentTypeLabel(type: string) {
  return ({ CASH: 'Наличные', CARD: 'Карта', BANK_TRANSFER: 'Перевод', DEPOSIT: 'Депозит', OTHER: 'Другое' } as Record<string, string>)[type] ?? type;
}

function number(value: Prisma.Decimal.Value | null | undefined) {
  if (value === null || value === undefined) return 0;
  return new Prisma.Decimal(value).toNumber();
}

function sum<T>(items: T[], selector: (item: T) => Prisma.Decimal.Value | number | null | undefined) {
  return items.reduce((total, item) => total + number(selector(item)), 0);
}

type ReportBill = {
  id: string;
  createdAt: Date;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  owner: { id: string; fullName: string } | null;
  visit: { employee: ReportEmployee | null } | null;
  items: Array<{
    serviceId: string | null;
    productId: string | null;
    title: string;
    quantity: Prisma.Decimal;
    discount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  }>;
};

type ReportEmployee = { id: string; fullName: string; position: string | null };
type ReportVisit = {
  id: string;
  ownerId: string;
  status: VisitStatus;
  startedAt: Date;
  totalAmount: Prisma.Decimal;
  employee: ReportEmployee | null;
};
type ReportCompletedVisit = {
  id: string;
  completedAt: Date | null;
  employee: ReportEmployee | null;
};
type ReportOverdueVisitAlert = {
  id: string;
  visitId: string;
  overdueAt: Date;
  createdAt: Date;
  employee: ReportEmployee | null;
};
type ReportPayment = {
  id: string;
  paidAt: Date;
  amount: Prisma.Decimal;
  type: string;
  paymentMethod: { id: string; title: string } | null;
  cashbox: { id: string; title: string } | null;
};
type ReportStockBatch = {
  id: string;
  rest: Prisma.Decimal;
  purchasePrice: Prisma.Decimal;
  expiresAt: Date | null;
  series: string | null;
  product: { id: string; title: string; retailPrice: Prisma.Decimal; minStock: Prisma.Decimal | null; stockUnit: string | null };
  warehouse: { id: string; name: string };
};
type ReportSalesRow = {
  key: string;
  kind: 'product' | 'service' | 'other';
  title: string;
  quantity: number;
  revenue: number;
  discount: number;
  lines: number;
};
