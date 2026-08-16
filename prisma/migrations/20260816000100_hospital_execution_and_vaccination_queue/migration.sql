ALTER TABLE "HospitalRecord"
  ADD COLUMN "performedById" TEXT,
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "QueueEntry"
  ADD COLUMN "isVaccination" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "HospitalRecord_performedById_idx" ON "HospitalRecord"("performedById");
CREATE INDEX "HospitalRecord_cancelledById_idx" ON "HospitalRecord"("cancelledById");

ALTER TABLE "HospitalRecord"
  ADD CONSTRAINT "HospitalRecord_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HospitalRecord"
  ADD CONSTRAINT "HospitalRecord_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
