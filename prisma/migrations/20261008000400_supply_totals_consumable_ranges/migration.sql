ALTER TABLE "ProductLinkedProduct" ADD COLUMN "minDoseMl" DECIMAL(12,3), ADD COLUMN "maxDoseMl" DECIMAL(12,3);
ALTER TABLE "ProductLinkedProduct" ADD CONSTRAINT "ProductLinkedProduct_dose_range_check" CHECK (
  ("minDoseMl" IS NULL AND "maxDoseMl" IS NULL) OR
  ("minDoseMl" IS NOT NULL AND "maxDoseMl" IS NOT NULL AND "minDoseMl" >= 0 AND "maxDoseMl" > "minDoseMl")
);
ALTER TABLE "SupplyInvoiceItem" ADD COLUMN "lineAmount" DECIMAL(12,2);
ALTER TABLE "SupplyInvoiceItem" ALTER COLUMN "purchasePrice" TYPE DECIMAL(18,6);
ALTER TABLE "StockBatch" ALTER COLUMN "purchasePrice" TYPE DECIMAL(18,6);
