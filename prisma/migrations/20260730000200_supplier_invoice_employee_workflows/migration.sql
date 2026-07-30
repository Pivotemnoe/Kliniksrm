-- Safe warehouse workflow extension.
-- Existing invoices, batches, movements, employees and clinical history are preserved.

ALTER TABLE "SupplyInvoiceItem" ADD COLUMN "stockBatchId" TEXT;

CREATE UNIQUE INDEX "SupplyInvoiceItem_stockBatchId_key" ON "SupplyInvoiceItem"("stockBatchId");

ALTER TABLE "SupplyInvoiceItem"
  ADD CONSTRAINT "SupplyInvoiceItem_stockBatchId_fkey"
  FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
