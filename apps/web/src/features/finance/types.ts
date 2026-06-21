import { PaymentType } from '../billing/types';

export type FinanceOffice = {
  id: string;
  name: string;
};

export type PaymentMethod = {
  id: string;
  title: string;
  type: PaymentType;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Cashbox = {
  id: string;
  officeId: string | null;
  office?: FinanceOffice | null;
  title: string;
  fiscalNumber: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FinanceSettings = {
  paymentMethods: PaymentMethod[];
  cashboxes: Cashbox[];
  offices: FinanceOffice[];
};

export type PaymentMethodInput = {
  title: string;
  type: PaymentType;
  isActive?: boolean;
  sortOrder?: number;
};

export type CashboxInput = {
  officeId?: string | null;
  title: string;
  fiscalNumber?: string | null;
  isActive?: boolean;
};
