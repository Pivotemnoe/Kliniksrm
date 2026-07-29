-- Optional catalog hint used to prefill the exact expiry date on stock receipt.
-- Real stock control continues to use StockBatch.expiresAt per batch.
ALTER TABLE "Product" ADD COLUMN "defaultExpiresAt" TIMESTAMP(3);

CREATE INDEX "Product_defaultExpiresAt_idx" ON "Product"("defaultExpiresAt");
