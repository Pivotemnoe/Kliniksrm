import { DecimalValue } from '../visits/types';

export type ProductCategory = {
  id: string;
  title: string;
};

export type ServiceCategory = {
  id: string;
  title: string;
};

export type Warehouse = {
  id: string;
  officeId: string;
  name: string;
  office?: {
    id: string;
    name: string;
  };
};

export type Supplier = {
  id: string;
  title: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  comment: string | null;
};

export type Product = {
  id: string;
  categoryId: string | null;
  category?: ProductCategory | null;
  title: string;
  sku: string | null;
  gtin: string | null;
  barcode: string | null;
  vatRate: DecimalValue | null;
  retailPrice: DecimalValue;
  stockUnit: string | null;
  writeOffUnit: string | null;
  packageQuantity: DecimalValue | null;
  minStock: DecimalValue | null;
  shelfLifeDays: number | null;
  description: string | null;
  stockRest?: DecimalValue;
  batches?: StockBatch[];
};

export type ServiceItem = {
  id: string;
  categoryId: string | null;
  category?: ServiceCategory | null;
  title: string;
  price: DecimalValue;
  priceType: string;
  vatRate: DecimalValue | null;
  description: string | null;
};

export type StockBatch = {
  id: string;
  productId: string;
  warehouseId: string;
  supplierId: string | null;
  quantity: DecimalValue;
  rest: DecimalValue;
  purchasePrice: DecimalValue;
  expiresAt: string | null;
  series: string | null;
  rack: string | null;
  rackNumber: string | null;
  shelfNumber: string | null;
  createdAt: string;
  product?: Product;
  warehouse?: Pick<Warehouse, 'id' | 'name'>;
  supplier?: Pick<Supplier, 'id' | 'title'> | null;
};

export type SupplyInvoice = {
  id: string;
  supplierId: string | null;
  supplier?: Supplier | null;
  number: string | null;
  suppliedAt: string;
  totalAmount: DecimalValue;
  items: SupplyInvoiceItem[];
  createdAt: string;
};

export type SupplyInvoiceItem = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: DecimalValue;
  purchasePrice: DecimalValue;
  discountAmount: DecimalValue;
  expiresAt: string | null;
  series: string | null;
  product?: Product;
  warehouse?: Pick<Warehouse, 'id' | 'name'>;
};

export type StockResources = {
  warehouses: Warehouse[];
  productCategories: ProductCategory[];
  serviceCategories: ServiceCategory[];
  suppliers: Supplier[];
};

export type ProductMutationInput = {
  title: string;
  categoryId?: string;
  categoryTitle?: string;
  sku?: string;
  gtin?: string;
  barcode?: string;
  vatRate?: number;
  retailPrice?: number;
  stockUnit?: string;
  writeOffUnit?: string;
  packageQuantity?: number;
  minStock?: number;
  shelfLifeDays?: number;
  description?: string;
};

export type ServiceMutationInput = {
  title: string;
  categoryId?: string;
  categoryTitle?: string;
  price?: number;
  priceType?: string;
  vatRate?: number;
  description?: string;
};

export type SupplyInvoiceMutationInput = {
  supplierId?: string;
  supplierTitle?: string;
  number?: string;
  suppliedAt?: string;
  items: Array<{
    productId: string;
    warehouseId?: string;
    quantity: number;
    purchasePrice: number;
    discountAmount?: number;
    expiresAt?: string;
    series?: string;
    rack?: string;
    rackNumber?: string;
    shelfNumber?: string;
  }>;
};
