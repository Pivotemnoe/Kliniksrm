-- Extend the append-only hospital journal into a multi-day plan/fact sheet.
-- Existing clinical rows are preserved and become completed facts.
CREATE TYPE "HospitalRecordStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED', 'AMENDMENT');

ALTER TABLE "HospitalRecord"
ADD COLUMN "recordStatus" "HospitalRecordStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN "createdAsPlan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "parentRecordId" TEXT,
ADD COLUMN "amendmentReason" TEXT;

UPDATE "HospitalRecord"
SET "completedAt" = "recordedAt"
WHERE "recordStatus" = 'COMPLETED' AND "completedAt" IS NULL;

CREATE INDEX "HospitalRecord_parentRecordId_idx" ON "HospitalRecord"("parentRecordId");
CREATE INDEX "HospitalRecord_visitId_recordStatus_recordedAt_idx" ON "HospitalRecord"("visitId", "recordStatus", "recordedAt");

ALTER TABLE "HospitalRecord"
ADD CONSTRAINT "HospitalRecord_parentRecordId_fkey"
FOREIGN KEY ("parentRecordId") REFERENCES "HospitalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
