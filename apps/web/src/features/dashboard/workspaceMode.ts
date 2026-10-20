import type { Employee } from '../../shared/types/auth';
import type { DashboardSummary } from './types';

export function resolveDashboardMode(employee: Employee | undefined, serverMode: DashboardSummary['workspace']['mode'] | undefined) {
  // Older clinic accounts can hold every access role. Their position still
  // identifies the administrator's workspace without changing those permissions.
  if (employee?.roles.includes('administrator') && employee.position?.trim().toLocaleLowerCase('ru') === 'администратор') {
    return 'administrator' as const;
  }
  return serverMode;
}
