import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  LaboratoryOrderStatus,
  OnlineRequestStatus,
  PaymentStatus,
  Prisma,
  QueueStatus,
  VisitStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getToday(query: DashboardQueryDto) {
    const { date, start, end } = resolveDayBounds(query.date);
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
    ] = await Promise.all([
      this.prisma.queueEntry.count({ where: { status: QueueStatus.WAITING } }),
      this.prisma.queueEntry.count({ where: { status: QueueStatus.IN_PROGRESS } }),
      this.prisma.queueEntry.count({ where: { status: QueueStatus.COMPLETED, completedAt: { gte: start, lte: end } } }),
      this.prisma.queueEntry.count({ where: { status: QueueStatus.CANCELLED, completedAt: { gte: start, lte: end } } }),
      this.prisma.queueEntry.findMany({
        where: { status: { in: [QueueStatus.IN_PROGRESS, QueueStatus.WAITING] } },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        take: 8,
        select: queueEntrySelect,
      }),
      this.prisma.appointment.count({ where: { startsAt: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.PLANNED, startsAt: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.ARRIVED, startsAt: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.IN_PROGRESS, startsAt: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.COMPLETED, startsAt: { gte: start, lte: end } } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.CANCELLED, startsAt: { gte: start, lte: end } } }),
      this.prisma.appointment.findMany({
        where: { startsAt: { gte: start, lte: end } },
        orderBy: { startsAt: 'asc' },
        take: 8,
        select: appointmentSelect,
      }),
      this.prisma.visit.count({ where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] }, hospitalBoxId: null } }),
      this.prisma.visit.count({ where: { status: VisitStatus.COMPLETED, completedAt: { gte: start, lte: end }, hospitalBoxId: null } }),
      this.prisma.visit.count({
        where: {
          status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS, VisitStatus.COMPLETED] },
          hospitalBoxId: null,
          OR: [{ startedAt: { gte: start, lte: end } }, { completedAt: { gte: start, lte: end } }],
        },
      }),
      this.prisma.visit.findMany({
        where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] }, hospitalBoxId: null },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: visitSelect,
      }),
      this.prisma.visit.findMany({
        where: {
          status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS, VisitStatus.COMPLETED] },
          hospitalBoxId: null,
          OR: [{ startedAt: { gte: start, lte: end } }, { completedAt: { gte: start, lte: end } }],
        },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: visitSelect,
      }),
      this.prisma.visit.count({ where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] }, hospitalBoxId: { not: null } } }),
      this.prisma.visit.count({ where: { startedAt: { gte: start, lte: end }, hospitalBoxId: { not: null } } }),
      this.prisma.visit.count({ where: { status: VisitStatus.COMPLETED, completedAt: { gte: start, lte: end }, hospitalBoxId: { not: null } } }),
      this.prisma.visit.findMany({
        where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] }, hospitalBoxId: { not: null } },
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
      this.prisma.laboratoryOrder.count({ where: { createdAt: { gte: start, lte: end } } }),
      this.prisma.laboratoryOrder.count({ where: { status: LaboratoryOrderStatus.COMPLETED, completedAt: { gte: start, lte: end } } }),
      this.prisma.laboratoryOrder.count({ where: { status: { in: [LaboratoryOrderStatus.ORDERED, LaboratoryOrderStatus.IN_PROGRESS] } } }),
      this.prisma.laboratoryOrder.findMany({
        where: { status: { in: [LaboratoryOrderStatus.ORDERED, LaboratoryOrderStatus.IN_PROGRESS] } },
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

    return {
      date,
      queue: {
        waiting: waitingQueue,
        inProgress: activeQueue,
        completedToday: completedQueueToday,
        cancelledToday: cancelledQueueToday,
        items: queueItems,
      },
      appointments: {
        today: appointmentsToday,
        planned: plannedAppointments,
        arrived: arrivedAppointments,
        inProgress: activeAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        items: appointmentItems,
      },
      visits: {
        active: activeVisits,
        completedToday: completedVisitsToday,
        totalToday: visitsToday,
        items: visitItems,
        todayItems: visitItemsToday,
      },
      finance: {
        billsToday,
        unpaidBills,
        paidBillsToday,
        paymentsTodayAmount: decimalToNumber(paymentsToday._sum.amount) ?? 0,
        refundsTodayAmount: Math.abs(decimalToNumber(refundsToday._sum.amount) ?? 0),
      },
      hospital: {
        activePatients: activeHospital,
        admittedToday: admittedHospitalToday,
        dischargedToday: dischargedHospitalToday,
        items: hospitalItems,
      },
      stock: {
        lowStockProducts: lowStockProducts.length,
        expiringBatches: expiringBatches.length,
        lowStockItems: lowStockProducts,
        expiringItems: expiringBatches,
      },
      onlineRequests: {
        newRequests: onlineNew,
        inReview: onlineInReview,
        items: onlineItems,
      },
      laboratory: {
        orderedToday: labOrderedToday,
        completedToday: labCompletedToday,
        pending: labPending,
        items: labItems,
      },
    };
  }
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
