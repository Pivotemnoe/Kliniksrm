export type SchedulingOffice = {
  id: string;
  name: string;
  phone?: string | null;
  timezone: string;
  address: string | null;
  workingHours?: OfficeWorkingHours | null;
};

export type SchedulingRoom = {
  id: string;
  officeId: string;
  name: string;
};

export type SchedulingHospitalBox = {
  id: string;
  officeId: string;
  name: string;
};

export type SchedulingWarehouse = {
  id: string;
  officeId: string;
  name: string;
};

export type SchedulingEmployee = {
  id: string;
  fullName: string;
  position: string | null;
  phone: string | null;
  restrictLoginToShifts: boolean;
};

export type SchedulingResources = {
  offices: SchedulingOffice[];
  rooms: SchedulingRoom[];
  employees: SchedulingEmployee[];
};

export type ClinicOfficeSettings = SchedulingOffice & {
  phone: string | null;
  rooms: SchedulingRoom[];
  hospitalBoxes: SchedulingHospitalBox[];
  warehouses: SchedulingWarehouse[];
  createdAt: string;
  updatedAt: string;
};

export type SchedulingSettings = {
  offices: ClinicOfficeSettings[];
};

export type OfficeWorkingDay = {
  isWorking: boolean;
  opensAt: string;
  closesAt: string;
  breakStart?: string | null;
  breakEnd?: string | null;
};

export type OfficeWorkingHours = Record<string, OfficeWorkingDay>;

export type UpdateClinicOfficePayload = {
  name?: string;
  phone?: string;
  timezone?: string;
  address?: string;
  workingHours?: OfficeWorkingHours;
};

export type CreateClinicOfficePayload = UpdateClinicOfficePayload & {
  name: string;
};

export type SchedulingResourcePayload = {
  officeId?: string;
  name: string;
};

export type EmployeeShift = {
  id: string;
  employeeId: string;
  employee: SchedulingEmployee;
  startsAt: string;
  endsAt: string;
  comment: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeShiftQuery = {
  employeeId?: string;
  from?: string;
  to?: string;
};

export type EmployeeShiftPayload = {
  employeeId: string;
  startsAt: string;
  endsAt: string;
  comment?: string | null;
  isActive?: boolean;
};
