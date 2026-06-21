import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import { CreateTaskInput, ListTasksQuery, Task, TaskMutationInput } from './types';

export function listTasks(query: ListTasksQuery) {
  return apiRequest<PaginatedResponse<Task>>(`/v1/tasks${buildQuery(query)}`);
}

export function getTask(taskId: string) {
  return apiRequest<Task>(`/v1/tasks/${taskId}`);
}

export function createTask(input: CreateTaskInput) {
  return apiRequest<Task>('/v1/tasks', {
    method: 'POST',
    body: input,
  });
}

export function updateTask(taskId: string, input: TaskMutationInput) {
  return apiRequest<Task>(`/v1/tasks/${taskId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function completeTask(taskId: string) {
  return apiRequest<Task>(`/v1/tasks/${taskId}/done`, { method: 'POST' });
}

export function cancelTask(taskId: string) {
  return apiRequest<Task>(`/v1/tasks/${taskId}/cancel`, { method: 'POST' });
}

export function reopenTask(taskId: string) {
  return apiRequest<Task>(`/v1/tasks/${taskId}/reopen`, { method: 'POST' });
}

export function archiveTask(taskId: string) {
  return apiRequest<Task>(`/v1/tasks/${taskId}/archive`, { method: 'POST' });
}
