import { Employee } from '../shared/types/auth';

export function hasPermission(employee: Employee | undefined, permission: string) {
  if (!employee) {
    return false;
  }

  return employee.permissions.includes('*') || employee.permissions.includes(permission);
}
