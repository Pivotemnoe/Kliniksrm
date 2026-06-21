import { Animal } from '../animals/types';
import { BillAnimal, BillOwner, PaymentStatus } from '../billing/types';
import { Owner } from '../owners/types';
import { Product, ServiceItem } from '../stock/types';
import { DecimalValue } from '../visits/types';

export type SaleBillSummary = {
  id: string;
  status: PaymentStatus;
  totalAmount: DecimalValue;
  paidAmount: DecimalValue;
};

export type SaleListItem = {
  id: string;
  ownerId: string | null;
  animalId: string | null;
  totalAmount: DecimalValue;
  owner: BillOwner | null;
  animal: BillAnimal | null;
  bill: SaleBillSummary | null;
  _count?: {
    items: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type Sale = Omit<SaleListItem, 'owner' | 'animal' | '_count'> & {
  owner: Owner | null;
  animal: Animal | null;
  items: SaleItem[];
  stockMovements: SaleStockMovement[];
};

export type SaleItem = {
  id: string;
  saleId: string;
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

export type SaleStockMovement = {
  id: string;
  productId: string;
  stockBatchId: string | null;
  warehouseId: string | null;
  type: string;
  quantity: DecimalValue;
  comment: string | null;
  createdAt: string;
  product?: Pick<Product, 'id' | 'title' | 'stockUnit'> | null;
  stockBatch?: {
    id: string;
    series: string | null;
    expiresAt: string | null;
  } | null;
  warehouse?: {
    id: string;
    name: string;
  } | null;
};

export type ListSalesQuery = {
  search?: string;
  ownerId?: string;
  animalId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type CreateSaleInput = {
  ownerId?: string;
  animalId?: string;
  items: CreateSaleItemInput[];
};

export type CreateSaleItemInput = {
  serviceId?: string;
  productId?: string;
  title?: string;
  quantity?: number;
  unitPrice?: number;
  discount?: number;
};
