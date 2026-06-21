import { Animal, AnimalSex } from '../animals/types';
import { Owner } from '../owners/types';
import { RoleTemplate } from '../employees/types';
import { SchedulingEmployee } from '../scheduling/types';

export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED' | 'ARCHIVED';

export type Task = {
  id: string;
  ownerId: string | null;
  animalId: string | null;
  assigneeId: string | null;
  assigneeRoleCode: string | null;
  creatorId: string | null;
  taskType: string | null;
  title: string;
  comment: string | null;
  status: TaskStatus;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: Pick<Owner, 'id' | 'fullName' | 'phone'> | null;
  animal?: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed'> & { sex: AnimalSex } | null;
  assignee?: Pick<SchedulingEmployee, 'id' | 'fullName' | 'position'> | null;
  creator?: Pick<SchedulingEmployee, 'id' | 'fullName' | 'position'> | null;
  assigneeRole?: Pick<RoleTemplate, 'code' | 'title'> | null;
};

export type TaskMutationInput = {
  ownerId?: string | null;
  animalId?: string | null;
  assigneeId?: string | null;
  assigneeRoleCode?: string | null;
  taskType?: string | null;
  title?: string;
  comment?: string | null;
  status?: TaskStatus;
  dueAt?: string | null;
};

export type CreateTaskInput = TaskMutationInput & {
  title: string;
};

export type ListTasksQuery = {
  search?: string;
  status?: TaskStatus;
  dueFrom?: string;
  dueTo?: string;
  ownerId?: string;
  animalId?: string;
  assigneeId?: string;
  assigneeRoleCode?: string;
  limit?: number;
  offset?: number;
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  OPEN: 'Открыта',
  DONE: 'Выполнена',
  CANCELLED: 'Отменена',
  ARCHIVED: 'В архиве',
};

export const taskStatusColors: Record<TaskStatus, string> = {
  OPEN: 'blue',
  DONE: 'green',
  CANCELLED: 'default',
  ARCHIVED: 'purple',
};

export const taskTypeOptions = [
  { value: 'call', label: 'Звонок клиенту' },
  { value: 'revaccination', label: 'Ревакцинация' },
  { value: 'follow_up', label: 'Контроль лечения' },
  { value: 'document', label: 'Документы' },
  { value: 'stock', label: 'Склад' },
  { value: 'other', label: 'Другое' },
];

export function getTaskTypeLabel(value: string | null | undefined) {
  return taskTypeOptions.find((item) => item.value === value)?.label ?? value ?? '—';
}
