-- Link an optional hospital journal record to the exact bill item that it created.
-- Existing hospital records, bills, stock batches and movements are preserved.
ALTER TABLE "HospitalRecord"
ADD COLUMN "billItemId" TEXT;

CREATE UNIQUE INDEX "HospitalRecord_billItemId_key" ON "HospitalRecord"("billItemId");

ALTER TABLE "HospitalRecord"
ADD CONSTRAINT "HospitalRecord_billItemId_fkey"
FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
