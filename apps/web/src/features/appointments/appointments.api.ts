import { apiRequest } from '../../api/client';
import { PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import {
  Appointment,
  AppointmentMutationInput,
  CreateAppointmentInput,
  ListAppointmentsQuery,
} from './types';

export function listAppointments(query: ListAppointmentsQuery) {
  return apiRequest<PaginatedResponse<Appointment>>(`/v1/appointments${buildQuery(query)}`);
}

export function getAppointment(appointmentId: string) {
  return apiRequest<Appointment>(`/v1/appointments/${appointmentId}`);
}

export function createAppointment(input: CreateAppointmentInput) {
  return apiRequest<Appointment>('/v1/appointments', {
    method: 'POST',
    body: input,
  });
}

export function updateAppointment(appointmentId: string, input: AppointmentMutationInput) {
  return apiRequest<Appointment>(`/v1/appointments/${appointmentId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function arriveAppointment(appointmentId: string) {
  return apiRequest<Appointment>(`/v1/appointments/${appointmentId}/arrive`, { method: 'POST' });
}

export function startAppointment(appointmentId: string) {
  return apiRequest<Appointment>(`/v1/appointments/${appointmentId}/start`, { method: 'POST' });
}

export function completeAppointment(appointmentId: string) {
  return apiRequest<Appointment>(`/v1/appointments/${appointmentId}/complete`, { method: 'POST' });
}

export function cancelAppointment(appointmentId: string) {
  return apiRequest<Appointment>(`/v1/appointments/${appointmentId}/cancel`, { method: 'POST' });
}
