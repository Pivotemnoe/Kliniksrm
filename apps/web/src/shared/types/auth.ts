export type Employee = {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  position: string | null;
  defaultRoute: string | null;
  status: string;
  roles: string[];
  permissions: string[];
};

export type AuthResponse = {
  employee: Employee;
  expiresAt: string;
};
