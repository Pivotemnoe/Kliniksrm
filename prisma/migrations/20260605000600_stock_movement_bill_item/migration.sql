ALTER TABLE "StockMovement" ADD COLUMN "billItemId" TEXT;

CREATE INDEX "StockMovement_billItemId_idx" ON "StockMovement"("billItemId");

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_billItemId_fkey"
  FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
