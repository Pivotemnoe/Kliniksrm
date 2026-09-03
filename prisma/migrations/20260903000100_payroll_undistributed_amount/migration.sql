-- Optional salary total for clinics that do not distribute the monthly accrual
-- between employees. Existing periods remain unchanged.
ALTER TABLE "PayrollPeriod"
  ADD COLUMN "undistributedAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "undistributedReason" TEXT;
