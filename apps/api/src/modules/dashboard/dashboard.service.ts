import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  LaboratoryOrderStatus,
  OnlineRequestStatus,
  PaymentStatus,
  Prisma,
  QueueStatus,
  TaskStatus,
  VisitStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthEmployee } from '../auth/auth.types';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getToday(query: DashboardQueryDto, actor: AuthEmployee) {
    const { date, start, end } = resolveDayBounds(query.date);
    const workspaceMode = resolveWorkspaceMode(actor.roles);
    const personalEmployeeId = workspaceMode === 'doctor' ? actor.id : null;
    const employeeWhere = personalEmployeeId ? { employeeId: personalEmployeeId } : {};
    const expiringUntil = new Date(start);
    expiringUntil.setDate(expiringUntil.getDate() + 30);

    const [
      waitingQueue,
      activeQueue,
      completedQueueToday,
      cancelledQueueToday,
      queueItems,
      appointmentsToday,
      plannedAppointments,
      arrivedAppointments,
      activeAppointments,
      completedAppointments,
      cancelledAppointments,
      appointmentItems,
      activeVisits,
      completedVisitsToday,
      visitsToday,
      visitItems,
      visitItemsToday,
      activeHospital,
      admittedHospitalToday,
      dischargedHospitalToday,
      hospitalItems,
      billsToday,
      unpaidBills,
      paidBillsToday,
      paymentsToday,
      refundsToday,
      onlineNew,
      onlineInReview,
      onlineItems,
      labOrderedToday,
      labCompletedToday,
      labPending,
      labItems,
      productsForStock,
      expiringBatches,
      workspaceShifts,
      workspaceTasks,
    ] = await Promise.all([
      this.prisma.queueEntry.count({ where: { status: QueueStatus.WAITING, ...employeeWhere } }),
      this.prisma.queueEntry.count({ where: { status: QueueStatus.IN_PROGRESS, ...employeeWhere } }),
      this.prisma.queueEntry.count({ where: { status: QueueStatus.COMPLETED, completedAt: { gte: start, lte: end }, ...employeeWhere } }),
      this.prisma.queueEntry.count({ where: { status: QueueStatus.CANCELLED, completedAt: { gte: start, lte: end }, ...employeeWhere } }),
      this.prisma.queueEntry.findMany({
        where: { status: { in: [QueueStatus.IN_PROGRESS, QueueStatus.WAITING] }, ...employeeWhere },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        take: 8,
        select: queueEntrySelect,
      }),
      this.prisma.appointment.count({ where: { startsAt: { gte: start, lte: end }, ...employeeWhere } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.PLANNED, startsAt: { gte: start, lte: end }, ...employeeWhere } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.ARRIVED, startsAt: { gte: start, lte: end }, ...employeeWhere } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.IN_PROGRESS, startsAt: { gte: start, lte: end }, ...employeeWhere } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.COMPLETED, startsAt: { gte: start, lte: end }, ...employeeWhere } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.CANCELLED, startsAt: { gte: start, lte: end }, ...employeeWhere } }),
      this.prisma.appointment.findMany({
        where: { startsAt: { gte: start, lte: end }, ...employeeWhere },
        orderBy: { startsAt: 'asc' },
        take: 8,
        select: appointmentSelect,
      }),
      this.prisma.visit.count({ where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] }, hospitalBoxId: null, ...employeeWhere } }),
      this.prisma.visit.count({ where: { status: VisitStatus.COMPLETED, completedAt: { gte: start, lte: end }, hospitalBoxId: null, ...employeeWhere } }),
      this.prisma.visit.count({
        where: {
          status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS, VisitStatus.COMPLETED] },
          hospitalBoxId: null,
          ...employeeWhere,
          OR: [{ startedAt: { gte: start, lte: end } }, { completedAt: { gte: start, lte: end } }],
        },
      }),
      this.prisma.visit.findMany({
        where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] }, hospitalBoxId: null, ...employeeWhere },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: visitSelect,
      }),
      this.prisma.visit.findMany({
        where: {
          status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS, VisitStatus.COMPLETED] },
          hospitalBoxId: null,
          ...employeeWhere,
          OR: [{ startedAt: { gte: start, lte: end } }, { completedAt: { gte: start, lte: end } }],
        },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: visitSelect,
      }),
      this.prisma.visit.count({ where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] }, hospitalBoxId: { not: null }, ...employeeWhere } }),
      this.prisma.visit.count({ where: { startedAt: { gte: start, lte: end }, hospitalBoxId: { not: null }, ...employeeWhere } }),
      this.prisma.visit.count({ where: { status: VisitStatus.COMPLETED, completedAt: { gte: start, lte: end }, hospitalBoxId: { not: null }, ...employeeWhere } }),
      this.prisma.visit.findMany({
        where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] }, hospitalBoxId: { not: null }, ...employeeWhere },
        orderBy: { startedAt: 'asc' },
        take: 6,
        select: hospitalVisitSelect,
      }),
      this.prisma.bill.count({ where: { createdAt: { gte: start, lte: end } } }),
      this.prisma.bill.count({ where: { status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] } } }),
      this.prisma.bill.count({ where: { status: PaymentStatus.PAID, updatedAt: { gte: start, lte: end } } }),
      this.prisma.payment.aggregate({
        where: { paidAt: { gte: start, lte: end }, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { paidAt: { gte: start, lte: end }, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.onlineAppointmentRequest.count({ where: { status: OnlineRequestStatus.NEW } }),
      this.prisma.onlineAppointmentRequest.count({ where: { status: OnlineRequestStatus.IN_REVIEW } }),
      this.prisma.onlineAppointmentRequest.findMany({
        where: { status: { in: [OnlineRequestStatus.NEW, OnlineRequestStatus.IN_REVIEW] } },
        orderBy: { createdAt: 'asc' },
        take: 6,
        select: onlineRequestSelect,
      }),
      this.prisma.laboratoryOrder.count({ where: { createdAt: { gte: start, lte: end }, ...(personalEmployeeId ? { visit: { employeeId: personalEmployeeId } } : {}) } }),
      this.prisma.laboratoryOrder.count({ where: { status: LaboratoryOrderStatus.COMPLETED, completedAt: { gte: start, lte: end }, ...(personalEmployeeId ? { visit: { employeeId: personalEmployeeId } } : {}) } }),
      this.prisma.laboratoryOrder.count({ where: { status: { in: [LaboratoryOrderStatus.ORDERED, LaboratoryOrderStatus.IN_PROGRESS] }, ...(personalEmployeeId ? { visit: { employeeId: personalEmployeeId } } : {}) } }),
      this.prisma.laboratoryOrder.findMany({
        where: { status: { in: [LaboratoryOrderStatus.ORDERED, LaboratoryOrderStatus.IN_PROGRESS] }, ...(personalEmployeeId ? { visit: { employeeId: personalEmployeeId } } : {}) },
        orderBy: { createdAt: 'asc' },
        take: 6,
        select: laboratoryOrderSelect,
      }),
      this.prisma.product.findMany({
        where: { minStock: { not: null } },
        orderBy: { title: 'asc' },
        take: 200,
        select: {
          id: true,
          title: true,
          stockUnit: true,
          minStock: true,
          batches: {
            where: { rest: { gt: 0 } },
            select: { rest: true },
          },
        },
      }),
      this.prisma.stockBatch.findMany({
        where: { rest: { gt: 0 }, expiresAt: { gte: start, lte: expiringUntil } },
        orderBy: { expiresAt: 'asc' },
        take: 6,
        select: {
          id: true,
          rest: true,
          expiresAt: true,
          series: true,
          product: { select: { id: true, title: true, stockUnit: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      personalEmployeeId
        ? this.prisma.employeeShift.findMany({
            where: {
              employeeId: personalEmployeeId,
              isActive: true,
              startsAt: { lt: end },
              endsAt: { gt: start },
            },
            orderBy: { startsAt: 'asc' },
            select: { id: true, startsAt: true, endsAt: true, comment: true, isActive: true },
          })
        : Promise.resolve([]),
      personalEmployeeId
        ? this.prisma.task.findMany({
            where: {
              status: TaskStatus.OPEN,
              OR: [{ assigneeId: personalEmployeeId }, { assigneeRoleCode: { in: actor.roles } }],
            },
            orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
            take: 6,
            select: {
              id: true,
              title: true,
              taskType: true,
              dueAt: true,
              status: true,
              owner: { select: { id: true, fullName: true } },
              animal: { select: { id: true, nickname: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const lowStockProducts = productsForStock
      .map((product) => {
        const rest = product.batches.reduce((sum, batch) => sum + (decimalToNumber(batch.rest) ?? 0), 0);
        return {
          id: product.id,
          title: product.title,
          stockUnit: product.stockUnit,
          minStock: decimalToNumber(product.minStock),
          rest,
        };
      })
      .filter((product) => product.minStock !== null && product.rest <= product.minStock)
      .sort((a, b) => a.rest - b.rest)
      .slice(0, 6);

    const canRead = (permission: string) => actor.permissions.includes('*') || actor.permissions.includes(permission);

    return {
      date,
      workspace: {
        mode: workspaceMode,
        employeeId: personalEmployeeId,
        shifts: canRead('appointments.read') ? workspaceShifts : [],
        tasks: canRead('tasks.read') ? workspaceTasks : [],
      },
      queue: canRead('queue.read') ? {
        waiting: waitingQueue,
        inProgress: activeQueue,
        completedToday: completedQueueToday,
        cancelledToday: cancelledQueueToday,
        items: queueItems,
      } : { waiting: 0, inProgress: 0, completedToday: 0, cancelledToday: 0, items: [] },
      appointments: canRead('appointments.read') ? {
        today: appointmentsToday,
        planned: plannedAppointments,
        arrived: arrivedAppointments,
        inProgress: activeAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        items: appointmentItems,
      } : { today: 0, planned: 0, arrived: 0, inProgress: 0, completed: 0, cancelled: 0, items: [] },
      visits: canRead('visits.read') ? {
        active: activeVisits,
        completedToday: completedVisitsToday,
        totalToday: visitsToday,
        items: visitItems,
        todayItems: visitItemsToday,
      } : { active: 0, completedToday: 0, totalToday: 0, items: [], todayItems: [] },
      finance: canRead('billing.read') ? {
        billsToday,
        unpaidBills,
        paidBillsToday,
        paymentsTodayAmount: decimalToNumber(paymentsToday._sum.amount) ?? 0,
        refundsTodayAmount: Math.abs(decimalToNumber(refundsToday._sum.amount) ?? 0),
      } : { billsToday: 0, unpaidBills: 0, paidBillsToday: 0, paymentsTodayAmount: 0, refundsTodayAmount: 0 },
      hospital: canRead('hospital.read') ? {
        activePatients: activeHospital,
        admittedToday: admittedHospitalToday,
        dischargedToday: dischargedHospitalToday,
        items: hospitalItems,
      } : { activePatients: 0, admittedToday: 0, dischargedToday: 0, items: [] },
      stock: canRead('stock.read') ? {
        lowStockProducts: lowStockProducts.length,
        expiringBatches: expiringBatches.length,
        lowStockItems: lowStockProducts,
        expiringItems: expiringBatches,
      } : { lowStockProducts: 0, expiringBatches: 0, lowStockItems: [], expiringItems: [] },
      onlineRequests: canRead('appointments.read') ? {
        newRequests: onlineNew,
        inReview: onlineInReview,
        items: onlineItems,
      } : { newRequests: 0, inReview: 0, items: [] },
      laboratory: canRead('laboratory.read') ? {
        orderedToday: labOrderedToday,
        completedToday: labCompletedToday,
        pending: labPending,
        items: labItems,
      } : { orderedToday: 0, completedToday: 0, pending: 0, items: [] },
    };
  }
}

function resolveWorkspaceMode(roles: string[]) {
  if (roles.includes('director')) {
    return 'director' as const;
  }

  if (roles.includes('administrator')) {
    return 'administrator' as const;
  }

  if (roles.includes('doctor')) {
    return 'doctor' as const;
  }

  return 'employee' as const;
}

function resolveDayBounds(value?: string) {
  const source = value ? new Date(value) : new Date();
  const start = new Date(source);
  start.setHours(0, 0, 0, 0);

  const end = new Date(source);
  end.setHours(23, 59, 59, 999);

  return {
    date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    start,
    end,
  };
}

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

const queueEntrySelect = {
  id: true,
  ownerName: true,
  phone: true,
  animalNickname: true,
  animalSpecies: true,
  urgency: true,
  status: true,
  comment: true,
  createdAt: true,
  startedAt: true,
  lastCalledAt: true,
  callCount: true,
  owner: { select: { id: true, fullName: true, phone: true } },
  animal: { select: { id: true, nickname: true, species: true, breed: true, sex: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  room: { select: { id: true, name: true } },
} satisfies Prisma.QueueEntrySelect;

const appointmentSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  comment: true,
  owner: { select: { id: true, fullName: true, phone: true } },
  animal: { select: { id: true, nickname: true, species: true, breed: true, sex: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  room: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentSelect;

const visitSelect = {
  id: true,
  status: true,
  startedAt: true,
  completedAt: true,
  totalAmount: true,
  owner: { select: { id: true, fullName: true, phone: true } },
  animal: { select: { id: true, nickname: true, species: true, breed: true, sex: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  bill: { select: { id: true, status: true, totalAmount: true, paidAmount: true } },
} satisfies Prisma.VisitSelect;

const hospitalVisitSelect = {
  ...visitSelect,
  hospitalBox: { select: { id: true, name: true } },
} satisfies Prisma.VisitSelect;

const onlineRequestSelect = {
  id: true,
  status: true,
  source: true,
  ownerName: true,
  phone: true,
  animalNickname: true,
  animalSpecies: true,
  preferredAt: true,
  comment: true,
  createdAt: true,
} satisfies Prisma.OnlineAppointmentRequestSelect;

const laboratoryOrderSelect = {
  id: true,
  status: true,
  comment: true,
  createdAt: true,
  completedAt: true,
  visit: {
    select: {
      id: true,
      owner: { select: { id: true, fullName: true, phone: true } },
      animal: { select: { id: true, nickname: true, species: true, breed: true, sex: true } },
    },
  },
  items: {
    select: {
      id: true,
      status: true,
      title: true,
      code: true,
      resultValue: true,
      resultText: true,
      completedAt: true,
    },
  },
} satisfies Prisma.LaboratoryOrderSelect;
