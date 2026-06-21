import { apiRequest } from '../../api/client';
import { CreateEmployeeInput, Employee, RoleTemplate, UpdateEmployeeInput } from './types';

export function listEmployees() {
  return apiRequest<Employee[]>('/v1/employees');
}

export function createEmployee(input: CreateEmployeeInput) {
  return apiRequest<Employee>('/v1/employees', {
    method: 'POST',
    body: input,
  });
}

export function updateEmployee(employeeId: string, input: UpdateEmployeeInput) {
  return apiRequest<Employee>(`/v1/employees/${employeeId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function listRoles() {
  return apiRequest<RoleTemplate[]>('/v1/roles');
}
