ALTER TABLE "SupplyInvoiceItem"
ADD COLUMN "receiptQuantity" DECIMAL(12,3),
ADD COLUMN "receiptUnit" TEXT,
ADD COLUMN "conversionFactor" DECIMAL(12,3);

UPDATE "SupplyInvoiceItem" AS item
SET
  "receiptQuantity" = item."quantity",
  "receiptUnit" = COALESCE(product."stockUnit", 'шт'),
  "conversionFactor" = 1
FROM "Product" AS product
WHERE product."id" = item."productId";

UPDATE "SupplyInvoiceItem"
SET
  "receiptQuantity" = COALESCE("receiptQuantity", "quantity"),
  "receiptUnit" = COALESCE("receiptUnit", 'шт'),
  "conversionFactor" = COALESCE("conversionFactor", 1);

ALTER TABLE "SupplyInvoiceItem"
ALTER COLUMN "receiptQuantity" SET NOT NULL,
ALTER COLUMN "receiptUnit" SET NOT NULL,
ALTER COLUMN "conversionFactor" SET NOT NULL,
ALTER COLUMN "conversionFactor" SET DEFAULT 1;
