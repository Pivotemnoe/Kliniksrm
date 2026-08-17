ALTER TABLE "StockMovement" ADD COLUMN "hospitalRecordId" TEXT;

ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_hospitalRecordId_fkey"
FOREIGN KEY ("hospitalRecordId") REFERENCES "HospitalRecord"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockMovement_hospitalRecordId_idx" ON "StockMovement"("hospitalRecordId");
