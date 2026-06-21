import { Animal } from '../animals/types';
import { Owner } from '../owners/types';
import { SchedulingEmployee, SchedulingOffice, SchedulingRoom } from '../scheduling/types';
import type { VisitSummary } from '../visits/types';

export type AppointmentStatus = 'PLANNED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type Appointment = {
  id: string;
  officeId: string | null;
  ownerId: string;
  animalId: string;
  employeeId: string | null;
  roomId: string | null;
  startsAt: string;
  endsAt: string | null;
  status: AppointmentStatus;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  office?: Pick<SchedulingOffice, 'id' | 'name' | 'timezone'> | null;
  owner?: Pick<Owner, 'id' | 'fullName' | 'phone' | 'extraPhone'> | null;
  animal?: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex' | 'status'> | null;
  employee?: Pick<SchedulingEmployee, 'id' | 'fullName' | 'position'> | null;
  room?: Pick<SchedulingRoom, 'id' | 'name'> | null;
  visit?: VisitSummary | null;
};

export type AppointmentMutationInput = {
  officeId?: string;
  ownerId?: string;
  animalId?: string;
  employeeId?: string;
  roomId?: string;
  startsAt?: string;
  endsAt?: string;
  status?: AppointmentStatus;
  comment?: string;
};

export type CreateAppointmentInput = AppointmentMutationInput & {
  ownerId: string;
  animalId: string;
  startsAt: string;
};

export type ListAppointmentsQuery = {
  search?: string;
  status?: AppointmentStatus;
  dateFrom?: string;
  dateTo?: string;
  ownerId?: string;
  animalId?: string;
  employeeId?: string;
  limit?: number;
  offset?: number;
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  PLANNED: 'Запланирована',
  ARRIVED: 'Пришёл',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Не пришёл',
};

export const appointmentStatusColors: Record<AppointmentStatus, string> = {
  PLANNED: 'blue',
  ARRIVED: 'cyan',
  IN_PROGRESS: 'gold',
  COMPLETED: 'green',
  CANCELLED: 'default',
  NO_SHOW: 'red',
};
