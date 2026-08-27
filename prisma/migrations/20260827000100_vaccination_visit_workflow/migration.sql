ALTER TYPE "VisitType" ADD VALUE IF NOT EXISTS 'VACCINATION';

ALTER TABLE "Vaccination"
  ADD COLUMN "visitId" TEXT,
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "billItemId" TEXT,
  ADD COLUMN "serviceBillItemId" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReason" TEXT;

CREATE UNIQUE INDEX "Vaccination_billItemId_key" ON "Vaccination"("billItemId");
CREATE UNIQUE INDEX "Vaccination_serviceBillItemId_key" ON "Vaccination"("serviceBillItemId");
CREATE INDEX "Vaccination_visitId_idx" ON "Vaccination"("visitId");
CREATE INDEX "Vaccination_productId_idx" ON "Vaccination"("productId");
CREATE INDEX "Vaccination_cancelledAt_idx" ON "Vaccination"("cancelledAt");

ALTER TABLE "Vaccination"
  ADD CONSTRAINT "Vaccination_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Vaccination_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Vaccination_billItemId_fkey"
  FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Vaccination_serviceBillItemId_fkey"
  FOREIGN KEY ("serviceBillItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Vaccination_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
