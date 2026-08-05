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

export type SupplierMutationInput = {
  title: string;
  phone?: string;
  email?: string;
  inn?: string;
  comment?: string;
};

export type Product = {
  id: string;
  categoryId: string | null;
  category?: ProductCategory | null;
  title: string;
  sku: string | null;
  gtin: string | null;
  barcode: string | null;
  barcodes?: Array<{ id: string; value: string; type: 'EAN13' | 'GTIN' | 'INTERNAL' | 'SUPPLIER' | 'OTHER'; isPrimary: boolean }>;
  vatRate: DecimalValue | null;
  retailPrice: DecimalValue;
  stockUnit: string | null;
  writeOffUnit: string | null;
  billingUnit: string | null;
  packageQuantity: DecimalValue | null;
  minStock: DecimalValue | null;
  shelfLifeDays: number | null;
  defaultExpiresAt: string | null;
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
  stockBatchId?: string | null;
  stockBatch?: Pick<StockBatch, 'id' | 'rack' | 'rackNumber' | 'shelfNumber' | 'quantity' | 'rest'> | null;
  product?: Product;
  warehouse?: Pick<Warehouse, 'id' | 'name'>;
};

export type StockResources = {
  warehouses: Warehouse[];
  productCategories: ProductCategory[];
  serviceCategories: ServiceCategory[];
  suppliers: Supplier[];
  cashboxes: Array<{ id: string; officeId: string | null; title: string }>;
  paymentMethods: Array<{ id: string; title: string; type: string }>;
  organization: {
    displayName: string;
    legalName: string | null;
    orgType: string | null;
    inn: string | null;
  } | null;
};

export type CatalogQualityReport = {
  total: number;
  cleanProducts: number;
  qualityPercent: number;
  counts: {
    withoutCategory: number;
    zeroPrice: number;
    missingUnits: number;
    legacyCompositeBarcode: number;
    duplicateBarcodeValues: number;
  };
  sample: Array<{ id: string; title: string; issues: string[] }>;
};

export type ProductMutationInput = {
  title: string;
  categoryId?: string;
  categoryTitle?: string;
  sku?: string;
  gtin?: string;
  barcode?: string;
  barcodes?: string[];
  vatRate?: number;
  retailPrice?: number;
  stockUnit?: string;
  writeOffUnit?: string;
  billingUnit?: string;
  packageQuantity?: number;
  minStock?: number;
  shelfLifeDays?: number;
  defaultExpiresAt?: string | null;
  generateBarcode?: boolean;
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
    retailPrice?: number;
    discountAmount?: number;
    expiresAt?: string;
    series?: string;
    rack?: string;
    rackNumber?: string;
    shelfNumber?: string;
  }>;
};

export type SupplyInvoiceUpdateInput = {
  supplierId?: string;
  number?: string;
  suppliedAt?: string;
  items: Array<SupplyInvoiceMutationInput['items'][number] & { id?: string; warehouseId: string }>;
};

export type StockDocumentType = 'INVENTORY' | 'TRANSFER' | 'SUPPLIER_RETURN' | 'WRITE_OFF' | 'RESORTING' | 'CORRECTION';
export type StockDocumentStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export type StockDocumentItem = {
  id: string;
  productId: string;
  targetProductId: string | null;
  sourceBatchId: string | null;
  targetBatchId: string | null;
  expectedQuantity: DecimalValue | null;
  actualQuantity: DecimalValue | null;
  quantity: DecimalValue | null;
  unitCost: DecimalValue | null;
  retailPrice: DecimalValue | null;
  comment: string | null;
  product?: Pick<Product, 'id' | 'title' | 'stockUnit' | 'barcode' | 'retailPrice'>;
  targetProduct?: Pick<Product, 'id' | 'title' | 'stockUnit' | 'barcode'> | null;
  sourceBatch?: Pick<StockBatch, 'id' | 'series' | 'expiresAt' | 'rest' | 'purchasePrice'> | null;
  targetBatch?: Pick<StockBatch, 'id' | 'series' | 'expiresAt' | 'rest' | 'purchasePrice'> | null;
};

export type StockDocument = {
  id: string;
  number: string | null;
  type: StockDocumentType;
  status: StockDocumentStatus;
  warehouseId: string | null;
  toWarehouseId: string | null;
  supplierId: string | null;
  occurredAt: string;
  comment: string | null;
  postedAt: string | null;
  warehouse?: Pick<Warehouse, 'id' | 'name'> | null;
  toWarehouse?: Pick<Warehouse, 'id' | 'name'> | null;
  supplier?: Pick<Supplier, 'id' | 'title'> | null;
  createdBy?: { id: string; fullName: string } | null;
  postedBy?: { id: string; fullName: string } | null;
  items: StockDocumentItem[];
};

export type StockDocumentMutationInput = {
  type: StockDocumentType;
  number?: string;
  warehouseId?: string;
  toWarehouseId?: string;
  supplierId?: string;
  occurredAt?: string;
  comment?: string;
  items: Array<{
    productId: string;
    targetProductId?: string;
    sourceBatchId?: string;
    actualQuantity?: number;
    quantity?: number;
    unitCost?: number;
    retailPrice?: number;
    comment?: string;
  }>;
};

export type StockMovement = {
  id: string;
  type: string;
  quantity: DecimalValue;
  unitCost: DecimalValue | null;
  createdAt: string;
  comment: string | null;
  product: Pick<Product, 'id' | 'title' | 'stockUnit'>;
  warehouse?: Pick<Warehouse, 'id' | 'name'> | null;
  toWarehouse?: Pick<Warehouse, 'id' | 'name'> | null;
  stockBatch?: { id: string; series: string | null; purchasePrice: DecimalValue } | null;
  targetStockBatch?: { id: string; series: string | null } | null;
  stockDocument?: { id: string; number: string | null; type: StockDocumentType } | null;
};

export type SupplierBalance = {
  id: string;
  title: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  comment: string | null;
  suppliedAmount: DecimalValue;
  returnedAmount: DecimalValue;
  paidAmount: DecimalValue;
  balance: DecimalValue;
  invoices: Array<{ id: string; number: string | null; suppliedAt: string; totalAmount: DecimalValue }>;
  payments: Array<{ id: string; amount: DecimalValue; paidAt: string; supplyInvoiceId: string | null; comment: string | null }>;
};
