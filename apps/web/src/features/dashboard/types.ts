import { AppointmentStatus } from '../appointments/types';
import { Animal } from '../animals/types';
import { Owner } from '../owners/types';
import { QueueStatus, QueueUrgency } from '../queue/types';
import { SchedulingEmployee, SchedulingRoom } from '../scheduling/types';
import { BillPaymentStatus, DecimalValue, VisitStatus } from '../visits/types';

export type DashboardSummary = {
  date: string;
  queue: {
    waiting: number;
    inProgress: number;
    completedToday: number;
    cancelledToday: number;
    items: DashboardQueueItem[];
  };
  appointments: {
    today: number;
    planned: number;
    arrived: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    items: DashboardAppointmentItem[];
  };
  visits: {
    active: number;
    completedToday: number;
    totalToday: number;
    items: DashboardVisitItem[];
    todayItems: DashboardVisitItem[];
  };
  finance: {
    billsToday: number;
    unpaidBills: number;
    paidBillsToday: number;
    paymentsTodayAmount: number;
    refundsTodayAmount: number;
  };
  hospital: {
    activePatients: number;
    admittedToday: number;
    dischargedToday: number;
    items: DashboardHospitalItem[];
  };
  stock: {
    lowStockProducts: number;
    expiringBatches: number;
    lowStockItems: DashboardLowStockItem[];
    expiringItems: DashboardExpiringBatchItem[];
  };
  onlineRequests: {
    newRequests: number;
    inReview: number;
    items: DashboardOnlineRequestItem[];
  };
  laboratory: {
    orderedToday: number;
    completedToday: number;
    pending: number;
    items: DashboardLaboratoryOrderItem[];
  };
};

export type DashboardQueueItem = {
  id: string;
  ownerName: string | null;
  phone: string | null;
  animalNickname: string | null;
  animalSpecies: string | null;
  urgency: QueueUrgency;
  status: QueueStatus;
  comment: string | null;
  createdAt: string;
  startedAt: string | null;
  lastCalledAt: string | null;
  callCount: number;
  owner: Pick<Owner, 'id' | 'fullName' | 'phone'> | null;
  animal: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex'> | null;
  employee: Pick<SchedulingEmployee, 'id' | 'fullName' | 'position'> | null;
  room: Pick<SchedulingRoom, 'id' | 'name'> | null;
};

export type DashboardAppointmentItem = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  status: AppointmentStatus;
  comment: string | null;
  owner: Pick<Owner, 'id' | 'fullName' | 'phone'> | null;
  animal: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex'> | null;
  employee: Pick<SchedulingEmployee, 'id' | 'fullName' | 'position'> | null;
  room: Pick<SchedulingRoom, 'id' | 'name'> | null;
};

export type DashboardVisitItem = {
  id: string;
  status: VisitStatus;
  startedAt: string;
  completedAt: string | null;
  totalAmount: DecimalValue;
  owner: Pick<Owner, 'id' | 'fullName' | 'phone'> | null;
  animal: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex'> | null;
  employee: Pick<SchedulingEmployee, 'id' | 'fullName' | 'position'> | null;
  bill: {
    id: string;
    status: BillPaymentStatus;
    totalAmount: DecimalValue;
    paidAmount: DecimalValue;
  } | null;
};

export type DashboardHospitalItem = DashboardVisitItem & {
  hospitalBox: { id: string; name: string } | null;
};

export type DashboardLowStockItem = {
  id: string;
  title: string;
  stockUnit: string | null;
  minStock: number | null;
  rest: number;
};

export type DashboardExpiringBatchItem = {
  id: string;
  rest: DecimalValue;
  expiresAt: string | null;
  series: string | null;
  product: { id: string; title: string; stockUnit: string | null };
  warehouse: { id: string; name: string };
};

export type DashboardOnlineRequestItem = {
  id: string;
  status: 'NEW' | 'IN_REVIEW' | 'ACCEPTED' | 'CANCELLED' | 'ARCHIVED';
  source: string;
  ownerName: string;
  phone: string;
  animalNickname: string;
  animalSpecies: string | null;
  preferredAt: string | null;
  comment: string | null;
  createdAt: string;
};

export type DashboardLaboratoryOrderItem = {
  id: string;
  status: 'ORDERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  comment: string | null;
  createdAt: string;
  completedAt: string | null;
  visit: {
    id: string;
    owner: Pick<Owner, 'id' | 'fullName' | 'phone'>;
    animal: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex'>;
  };
  items: Array<{
    id: string;
    status: 'ORDERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    title: string;
    code: string | null;
    resultValue: string | null;
    resultText: string | null;
    completedAt: string | null;
  }>;
};
