import { Animal } from '../animals/types';
import { Owner } from '../owners/types';
import { Product, ServiceItem } from '../stock/types';
import { DecimalValue } from '../visits/types';

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED' | 'CANCELLED';
export type PaymentType = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'DEPOSIT' | 'OTHER';
export type BillSource = 'VISIT' | 'SALE' | 'MANUAL';

export type BillOwner = Pick<Owner, 'id' | 'fullName' | 'phone' | 'extraPhone'>;
export type BillAnimal = Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex' | 'status'>;

export type BillListItem = {
  id: string;
  ownerId: string | null;
  animalId: string | null;
  visitId: string | null;
  saleId: string | null;
  source: BillSource;
  status: PaymentStatus;
  totalAmount: DecimalValue;
  paidAmount: DecimalValue;
  dueAt: string | null;
  owner: BillOwner | null;
  animal: BillAnimal | null;
  visit: {
    id: string;
    status: string;
    startedAt: string | null;
  } | null;
  _count?: {
    items: number;
    payments: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type Bill = Omit<BillListItem, 'owner' | 'animal' | '_count'> & {
  owner: Owner | null;
  animal: Animal | null;
  sale: {
    id: string;
    createdAt: string;
    totalAmount: DecimalValue;
  } | null;
  items: BillItem[];
  payments: Payment[];
};

export type BillItem = {
  id: string;
  billId: string;
  productId: string | null;
  product?: Pick<Product, 'id' | 'title' | 'retailPrice'> | null;
  serviceId: string | null;
  service?: Pick<ServiceItem, 'id' | 'title' | 'price'> | null;
  title: string;
  quantity: DecimalValue;
  unitPrice: DecimalValue;
  discount: DecimalValue;
  totalAmount: DecimalValue;
  createdAt: string;
};

export type Payment = {
  id: string;
  billId: string;
  employeeId: string | null;
  paymentMethodId: string | null;
  cashboxId: string | null;
  employee?: {
    id: string;
    fullName: string;
    position: string | null;
  } | null;
  paymentMethod?: {
    id: string;
    title: string;
    type: PaymentType;
    isActive: boolean;
  } | null;
  cashbox?: {
    id: string;
    title: string;
    fiscalNumber: string | null;
    office?: {
      id: string;
      name: string;
    } | null;
  } | null;
  type: PaymentType;
  amount: DecimalValue;
  paidAt: string;
  comment: string | null;
  createdAt: string;
};

export type ListBillsQuery = {
  search?: string;
  status?: PaymentStatus;
  source?: BillSource;
  ownerId?: string;
  animalId?: string;
  visitId?: string;
  dateFrom?: string;
  dateTo?: string;
  debtOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type BillAlertsResponse = {
  items: BillListItem[];
  total: number;
  totalDebt: DecimalValue;
  overdueTotal: number;
  overdueDebt: DecimalValue;
  limit: number;
  offset: number;
};

export type CreateBillInput = {
  ownerId?: string;
  animalId?: string;
  visitId?: string;
  dueAt?: string;
};

export type UpdateBillInput = {
  dueAt?: string | null;
};

export type BillItemMutationInput = {
  serviceId?: string;
  productId?: string;
  title?: string;
  quantity?: number;
  unitPrice?: number;
  discount?: number;
};

export type CreatePaymentInput = {
  type: PaymentType;
  paymentMethodId?: string;
  cashboxId?: string;
  amount: number;
  paidAt?: string;
  comment?: string;
};

export type RefundPaymentInput = {
  amount?: number;
  comment?: string;
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  UNPAID: 'Не оплачен',
  PARTIAL: 'Частично',
  PAID: 'Оплачен',
  REFUNDED: 'Возврат',
  CANCELLED: 'Отменён',
};

export const paymentStatusColors: Record<PaymentStatus, string> = {
  UNPAID: 'red',
  PARTIAL: 'gold',
  PAID: 'green',
  REFUNDED: 'purple',
  CANCELLED: 'default',
};

export const billSourceLabels: Record<BillSource, string> = {
  VISIT: 'Приём',
  SALE: 'Продажа',
  MANUAL: 'Ручной счёт',
};

export const paymentTypeLabels: Record<PaymentType, string> = {
  CASH: 'Наличные',
  CARD: 'Карта',
  BANK_TRANSFER: 'Перевод',
  DEPOSIT: 'Депозит',
  OTHER: 'Другое',
};
