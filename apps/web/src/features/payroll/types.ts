import { DecimalValue } from '../visits/types';

export type PayrollCatalogItem = { id: string; title: string };

export type PayrollProfile = {
  id: string;
  employeeId: string;
  fixedAmount: DecimalValue;
  shiftRate: DecimalValue;
  servicePercent: DecimalValue;
  productPercent: DecimalValue;
  isActive: boolean;
  serviceRules: Array<{ id: string; serviceId: string; percent: DecimalValue; service?: PayrollCatalogItem }>;
  productRules: Array<{ id: string; productId: string; percent: DecimalValue; product?: PayrollCatalogItem }>;
};

export type PayrollEmployee = {
  id: string;
  fullName: string;
  position: string | null;
  payrollProfile: PayrollProfile | null;
};

export type PayrollResources = {
  employees: PayrollEmployee[];
  services: PayrollCatalogItem[];
  products: PayrollCatalogItem[];
};

export type PayrollPeriodStatus = 'DRAFT' | 'APPROVED';

export type PayrollPeriod = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: PayrollPeriodStatus;
  totalAmount: DecimalValue;
  approvedAt: string | null;
  createdBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
  entries?: PayrollEntry[];
  adjustments?: PayrollAdjustment[];
  _count?: { entries: number; adjustments: number };
};

export type PayrollEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  fixedAmount: DecimalValue;
  shiftCount: number;
  shiftAmount: DecimalValue;
  serviceRevenue: DecimalValue;
  serviceAmount: DecimalValue;
  productRevenue: DecimalValue;
  productAmount: DecimalValue;
  adjustmentAmount: DecimalValue;
  totalAmount: DecimalValue;
};

export type PayrollAdjustment = {
  id: string;
  employeeId: string;
  amount: DecimalValue;
  reason: string;
  createdAt: string;
  employee?: { id: string; fullName: string };
  createdBy?: { id: string; fullName: string } | null;
};

export type PayrollProfileInput = {
  fixedAmount: number;
  shiftRate: number;
  servicePercent: number;
  productPercent: number;
  isActive: boolean;
  serviceRules: Array<{ serviceId: string; percent: number }>;
  productRules: Array<{ productId: string; percent: number }>;
};
