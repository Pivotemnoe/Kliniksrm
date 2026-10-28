import { ForbiddenException } from '@nestjs/common';
import type { AuthEmployee } from '../auth/auth.types';

export const staffAppCodes = { enabled: 'staff_app.use', clinicBooking: 'staff_app.clinic_booking',
  groomingBooking: 'staff_app.grooming_booking', notifications: 'staff_app.notifications' } as const;
export type StaffAppSettings = Record<keyof typeof staffAppCodes, boolean>;
export function staffAppSettings(overrides: Array<{ effect: string; permission: { code: string } }> = []): StaffAppSettings {
  const effect = (key: keyof typeof staffAppCodes) => overrides.find(item => item.permission.code === staffAppCodes[key])?.effect;
  return { enabled: effect('enabled') !== 'DENY', clinicBooking: effect('clinicBooking') === 'GRANT',
    groomingBooking: effect('groomingBooking') === 'GRANT', notifications: effect('notifications') !== 'DENY' };
}
export function assertStaffApp(actor: AuthEmployee) {
  if (actor.staffApp?.enabled === false) throw new ForbiddenException('Приложение сотрудника отключено в CRM');
}
export function assertStaffBooking(actor: AuthEmployee, kind: 'clinic' | 'grooming') {
  assertStaffApp(actor);
  const grooming = actor.accountScope === 'GROOMING' || actor.roles.includes('groomer');
  if (kind === 'grooming' ? !grooming || !actor.staffApp?.groomingBooking || !['grooming.read', 'grooming.operate'].every(code => actor.permissions.includes(code))
    : grooming || !actor.staffApp?.clinicBooking || !['appointments.read', 'appointments.manage'].every(code => actor.permissions.includes(code))) {
    throw new ForbiddenException('Запись с телефона для этого сотрудника не включена');
  }
}
