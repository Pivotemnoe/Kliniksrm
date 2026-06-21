export type EmployeeStatus = 'ACTIVE' | 'BLOCKED';

export type EmployeeRole = {
  code: string;
  title: string;
  permissions: string[];
};

export type EmployeePermissionOverride = {
  code: string;
  title: string;
  effect: 'GRANT' | 'DENY';
};

export type EmployeeWarehouse = {
  id: string;
  officeId: string;
  name: string;
};

export type Employee = {
  id: string;
  fullName: string;
  phone: string | null;
  position: string | null;
  defaultRoute: string | null;
  status: EmployeeStatus;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  roles: EmployeeRole[];
  permissionOverrides: EmployeePermissionOverride[];
  warehouses: EmployeeWarehouse[];
  effectivePermissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type RoleTemplate = {
  code: string;
  title: string;
  description: string | null;
  permissions: {
    code: string;
    title: string;
  }[];
};

export type CreateEmployeeInput = {
  fullName: string;
  phone?: string;
  email?: string;
  position?: string;
  defaultRoute?: string | null;
  password: string;
  roleCodes: string[];
  permissionGrants?: string[];
  permissionDenials?: string[];
  warehouseIds?: string[];
};

export type UpdateEmployeeInput = {
  fullName: string;
  phone?: string;
  email?: string;
  position?: string;
  defaultRoute?: string | null;
  password?: string;
  status: EmployeeStatus;
  roleCodes: string[];
  permissionGrants?: string[];
  permissionDenials?: string[];
  warehouseIds?: string[];
};
