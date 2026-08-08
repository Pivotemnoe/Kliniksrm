-- Additive payroll fix: preserve existing adjustments and allow explicit one-off salary accruals.
-- Existing payroll, clinical, billing, stock and payment records are not rewritten or deleted.

CREATE TYPE "PayrollAdjustmentType" AS ENUM ('ADJUSTMENT', 'MANUAL_SALARY');

ALTER TABLE "PayrollAdjustment"
  ADD COLUMN "type" "PayrollAdjustmentType" NOT NULL DEFAULT 'ADJUSTMENT',
  ADD COLUMN "accruedAt" TIMESTAMP(3);

ALTER TABLE "PayrollEntry"
  ADD COLUMN "manualAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE INDEX "PayrollAdjustment_periodId_type_idx" ON "PayrollAdjustment"("periodId", "type");
