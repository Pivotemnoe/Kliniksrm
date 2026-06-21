import { Animal } from '../animals/types';
import { Appointment } from '../appointments/types';
import { Owner } from '../owners/types';

export type OnlineRequestStatus = 'NEW' | 'IN_REVIEW' | 'ACCEPTED' | 'CANCELLED' | 'ARCHIVED';

export type OnlineAppointmentRequest = {
  id: string;
  status: OnlineRequestStatus;
  source: string;
  ownerName: string;
  phone: string;
  email: string | null;
  animalNickname: string;
  animalSpecies: string | null;
  animalBreed: string | null;
  preferredAt: string | null;
  comment: string | null;
  internalComment: string | null;
  ownerId: string | null;
  animalId: string | null;
  appointmentId: string | null;
  owner?: Pick<Owner, 'id' | 'fullName' | 'phone'> | null;
  animal?: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed'> | null;
  appointment?: Pick<Appointment, 'id' | 'startsAt' | 'endsAt' | 'status'> & {
    employee?: { id: string; fullName: string } | null;
    room?: { id: string; name: string } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ListOnlineRequestsQuery = {
  search?: string;
  status?: OnlineRequestStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type CreateOnlineRequestInput = {
  ownerName: string;
  phone: string;
  email?: string | null;
  animalNickname: string;
  animalSpecies?: string | null;
  animalBreed?: string | null;
  preferredAt?: string | null;
  comment?: string | null;
  source?: string | null;
};

export type UpdateOnlineRequestInput = Partial<CreateOnlineRequestInput> & {
  status?: OnlineRequestStatus;
  internalComment?: string | null;
  ownerId?: string;
  animalId?: string;
};

export type AcceptOnlineRequestInput = {
  ownerId: string;
  animalId: string;
  officeId?: string;
  employeeId?: string;
  roomId?: string;
  startsAt?: string;
  endsAt?: string;
  comment?: string;
};

export const onlineRequestStatusLabels: Record<OnlineRequestStatus, string> = {
  NEW: 'Новая',
  IN_REVIEW: 'В работе',
  ACCEPTED: 'Принята',
  CANCELLED: 'Отменена',
  ARCHIVED: 'Архив',
};

export const onlineRequestStatusColors: Record<OnlineRequestStatus, string> = {
  NEW: 'blue',
  IN_REVIEW: 'gold',
  ACCEPTED: 'green',
  CANCELLED: 'red',
  ARCHIVED: 'default',
};
