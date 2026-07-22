import { Animal } from '../animals/types';
import { Owner } from '../owners/types';
import { SchedulingEmployee, SchedulingOffice, SchedulingRoom } from '../scheduling/types';
import type { VisitSummary, VisitType } from '../visits/types';

export type QueueUrgency = 'PLANNED' | 'URGENT';
export type QueueStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type QueueEntry = {
  id: string;
  officeId: string | null;
  ownerId: string | null;
  animalId: string | null;
  employeeId: string | null;
  roomId: string | null;
  ownerName: string | null;
  phone: string | null;
  ownerAddress: string | null;
  animalNickname: string | null;
  animalSpecies: string | null;
  animalBreed: string | null;
  animalSex: Animal['sex'] | null;
  visitType: VisitType | null;
  urgency: QueueUrgency;
  status: QueueStatus;
  comment: string | null;
  createdAt: string;
  startedAt: string | null;
  lastCalledAt: string | null;
  callCount: number;
  completedAt: string | null;
  updatedAt: string;
  office?: Pick<SchedulingOffice, 'id' | 'name' | 'timezone'> | null;
  owner?: Pick<Owner, 'id' | 'fullName' | 'phone' | 'extraPhone' | 'address'> | null;
  animal?: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex' | 'status'> | null;
  employee?: Pick<SchedulingEmployee, 'id' | 'fullName' | 'position'> | null;
  room?: Pick<SchedulingRoom, 'id' | 'name'> | null;
  visit?: VisitSummary | null;
};

export type QueueScreenItem = {
  id: string;
  clientSurname: string;
  animalName: string;
  animalSpecies: string | null;
  roomName: string | null;
  employeeName: string | null;
  urgency: QueueUrgency;
  status: QueueStatus;
  createdAt: string;
  startedAt: string | null;
  lastCalledAt: string | null;
  callCount: number;
};

export type QueueScreenResponse = {
  waiting: QueueScreenItem[];
  called: QueueScreenItem[];
};

export type QueueMutationInput = {
  officeId?: string;
  ownerId?: string;
  animalId?: string;
  employeeId?: string;
  roomId?: string;
  ownerName?: string;
  phone?: string;
  ownerAddress?: string;
  animalNickname?: string;
  animalSpecies?: string;
  animalBreed?: string;
  animalSex?: Animal['sex'];
  visitType?: VisitType;
  urgency?: QueueUrgency;
  status?: QueueStatus;
  comment?: string;
};

export type ListQueueQuery = {
  search?: string;
  status?: QueueStatus;
  urgency?: QueueUrgency;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export const queueStatusLabels: Record<QueueStatus, string> = {
  WAITING: 'Ожидает',
  IN_PROGRESS: 'Вызван',
  COMPLETED: 'Направлен на приём',
  CANCELLED: 'Отменена',
};

export const queueUrgencyLabels: Record<QueueUrgency, string> = {
  PLANNED: 'Плановая',
  URGENT: 'Срочная',
};

export const queueStatusColors: Record<QueueStatus, string> = {
  WAITING: 'blue',
  IN_PROGRESS: 'gold',
  COMPLETED: 'green',
  CANCELLED: 'default',
};

export const queueUrgencyColors: Record<QueueUrgency, string> = {
  PLANNED: 'default',
  URGENT: 'red',
};

export function getQueueDisplayStatus(queueEntry: Pick<QueueEntry, 'status' | 'visit'>) {
  if (queueEntry.status !== 'COMPLETED') {
    return {
      label: queueStatusLabels[queueEntry.status],
      color: queueStatusColors[queueEntry.status],
    };
  }

  if (queueEntry.visit?.status === 'COMPLETED') {
    return { label: 'Приём завершён', color: 'green' };
  }

  if (queueEntry.visit?.status === 'CANCELLED') {
    return { label: 'Приём отменён', color: 'red' };
  }

  if (queueEntry.visit?.status === 'IN_PROGRESS') {
    return { label: 'Идёт приём', color: 'processing' };
  }

  if (queueEntry.visit?.status === 'DRAFT') {
    return { label: 'Черновик приёма', color: 'gold' };
  }

  return { label: 'Приём не создан', color: 'orange' };
}
