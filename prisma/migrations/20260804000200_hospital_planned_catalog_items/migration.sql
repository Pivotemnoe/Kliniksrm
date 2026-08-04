-- Keep the catalog identity and per-execution quantities on planned inpatient actions.
-- Stock and billing remain unchanged until the action is marked completed.
ALTER TABLE "HospitalRecord"
    ADD COLUMN "plannedProductId" TEXT,
    ADD COLUMN "plannedServiceId" TEXT,
    ADD COLUMN "plannedQuantity" DECIMAL(12,3),
    ADD COLUMN "plannedStockQuantity" DECIMAL(12,3),
    ADD COLUMN "plannedUnitPrice" DECIMAL(12,2);

CREATE INDEX "HospitalRecord_plannedProductId_idx"
    ON "HospitalRecord"("plannedProductId");

CREATE INDEX "HospitalRecord_plannedServiceId_idx"
    ON "HospitalRecord"("plannedServiceId");

ALTER TABLE "HospitalRecord"
    ADD CONSTRAINT "HospitalRecord_plannedProductId_fkey"
    FOREIGN KEY ("plannedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HospitalRecord"
    ADD CONSTRAINT "HospitalRecord_plannedServiceId_fkey"
    FOREIGN KEY ("plannedServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
