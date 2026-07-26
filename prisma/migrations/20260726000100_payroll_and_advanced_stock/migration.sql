-- Additive payroll and advanced-stock foundation.
-- Existing clinical, billing and stock records are not rewritten or deleted.

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'INVENTORY';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'RESORTING';

CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE "StockDocumentType" AS ENUM (
  'INVENTORY',
  'TRANSFER',
  'SUPPLIER_RETURN',
  'WRITE_OFF',
  'RESORTING',
  'CORRECTION'
);
CREATE TYPE "StockDocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

ALTER TABLE "Sale" ADD COLUMN "employeeId" TEXT;
ALTER TABLE "StockMovement"
  ADD COLUMN "targetStockBatchId" TEXT,
  ADD COLUMN "unitCost" DECIMAL(12,2),
  ADD COLUMN "stockDocumentId" TEXT,
  ADD COLUMN "stockDocumentItemId" TEXT;

CREATE TABLE "PayrollProfile" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "fixedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shiftRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "servicePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "productPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollServiceRule" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "percent" DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollServiceRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollProductRule" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "percent" DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollProductRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollPeriod" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollEntry" (
  "id" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "fixedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shiftCount" INTEGER NOT NULL DEFAULT 0,
  "shiftAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "serviceRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "serviceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "productRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "productAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollAdjustment" (
  "id" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockDocument" (
  "id" TEXT NOT NULL,
  "number" TEXT,
  "type" "StockDocumentType" NOT NULL,
  "status" "StockDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "warehouseId" TEXT,
  "toWarehouseId" TEXT,
  "supplierId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comment" TEXT,
  "createdById" TEXT,
  "postedById" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockDocumentItem" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "targetProductId" TEXT,
  "sourceBatchId" TEXT,
  "targetBatchId" TEXT,
  "expectedQuantity" DECIMAL(12,3),
  "actualQuantity" DECIMAL(12,3),
  "quantity" DECIMAL(12,3),
  "unitCost" DECIMAL(12,2),
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockDocumentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPayment" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "supplyInvoiceId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comment" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollProfile_employeeId_key" ON "PayrollProfile"("employeeId");
CREATE INDEX "PayrollProfile_isActive_idx" ON "PayrollProfile"("isActive");
CREATE UNIQUE INDEX "PayrollServiceRule_profileId_serviceId_key" ON "PayrollServiceRule"("profileId", "serviceId");
CREATE INDEX "PayrollServiceRule_serviceId_idx" ON "PayrollServiceRule"("serviceId");
CREATE UNIQUE INDEX "PayrollProductRule_profileId_productId_key" ON "PayrollProductRule"("profileId", "productId");
CREATE INDEX "PayrollProductRule_productId_idx" ON "PayrollProductRule"("productId");
CREATE INDEX "PayrollPeriod_status_startsAt_idx" ON "PayrollPeriod"("status", "startsAt");
CREATE INDEX "PayrollPeriod_startsAt_endsAt_idx" ON "PayrollPeriod"("startsAt", "endsAt");
CREATE UNIQUE INDEX "PayrollEntry_periodId_employeeId_key" ON "PayrollEntry"("periodId", "employeeId");
CREATE INDEX "PayrollEntry_employeeId_idx" ON "PayrollEntry"("employeeId");
CREATE INDEX "PayrollAdjustment_periodId_employeeId_idx" ON "PayrollAdjustment"("periodId", "employeeId");
CREATE INDEX "StockDocument_type_status_occurredAt_idx" ON "StockDocument"("type", "status", "occurredAt");
CREATE INDEX "StockDocument_warehouseId_idx" ON "StockDocument"("warehouseId");
CREATE INDEX "StockDocument_toWarehouseId_idx" ON "StockDocument"("toWarehouseId");
CREATE INDEX "StockDocument_supplierId_idx" ON "StockDocument"("supplierId");
CREATE INDEX "StockDocumentItem_documentId_idx" ON "StockDocumentItem"("documentId");
CREATE INDEX "StockDocumentItem_productId_idx" ON "StockDocumentItem"("productId");
CREATE INDEX "StockDocumentItem_sourceBatchId_idx" ON "StockDocumentItem"("sourceBatchId");
CREATE INDEX "StockDocumentItem_targetBatchId_idx" ON "StockDocumentItem"("targetBatchId");
CREATE INDEX "SupplierPayment_supplierId_paidAt_idx" ON "SupplierPayment"("supplierId", "paidAt");
CREATE INDEX "SupplierPayment_supplyInvoiceId_idx" ON "SupplierPayment"("supplyInvoiceId");
CREATE INDEX "Sale_employeeId_idx" ON "Sale"("employeeId");
CREATE INDEX "StockMovement_stockDocumentId_idx" ON "StockMovement"("stockDocumentId");
CREATE INDEX "StockMovement_stockDocumentItemId_idx" ON "StockMovement"("stockDocumentItemId");

ALTER TABLE "PayrollProfile" ADD CONSTRAINT "PayrollProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollServiceRule" ADD CONSTRAINT "PayrollServiceRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PayrollProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollServiceRule" ADD CONSTRAINT "PayrollServiceRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollProductRule" ADD CONSTRAINT "PayrollProductRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PayrollProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollProductRule" ADD CONSTRAINT "PayrollProductRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockDocumentItem" ADD CONSTRAINT "StockDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockDocumentItem" ADD CONSTRAINT "StockDocumentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockDocumentItem" ADD CONSTRAINT "StockDocumentItem_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockDocumentItem" ADD CONSTRAINT "StockDocumentItem_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockDocumentItem" ADD CONSTRAINT "StockDocumentItem_targetBatchId_fkey" FOREIGN KEY ("targetBatchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplyInvoiceId_fkey" FOREIGN KEY ("supplyInvoiceId") REFERENCES "SupplyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_targetStockBatchId_fkey" FOREIGN KEY ("targetStockBatchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockDocumentId_fkey" FOREIGN KEY ("stockDocumentId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockDocumentItemId_fkey" FOREIGN KEY ("stockDocumentItemId") REFERENCES "StockDocumentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "title", "createdAt", "updatedAt") VALUES
  ('33333333-3333-4333-8333-000000000001', 'payroll.read', 'Просмотр расчётов зарплаты', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('33333333-3333-4333-8333-000000000002', 'payroll.manage', 'Настройка и расчёт зарплаты', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('33333333-3333-4333-8333-000000000003', 'payroll.approve', 'Утверждение зарплаты', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "title" = EXCLUDED."title", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN ('payroll.read', 'payroll.manage', 'payroll.approve')
WHERE role."code" = 'director'
ON CONFLICT DO NOTHING;
