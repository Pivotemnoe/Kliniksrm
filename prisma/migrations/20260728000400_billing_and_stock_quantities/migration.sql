ALTER TABLE "Product"
ADD COLUMN "billingUnit" TEXT;

UPDATE "Product"
SET "billingUnit" = COALESCE("writeOffUnit", "stockUnit", 'шт')
WHERE "billingUnit" IS NULL;

ALTER TABLE "BillItem"
ADD COLUMN "stockQuantity" DECIMAL(12,3);

UPDATE "BillItem"
SET "stockQuantity" = "quantity"
WHERE "productId" IS NOT NULL
  AND "stockQuantity" IS NULL;
