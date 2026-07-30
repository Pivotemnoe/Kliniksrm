-- Additive link for idempotent import from the public owner gateway.
ALTER TABLE "OnlineAppointmentRequest" ADD COLUMN "externalRequestId" TEXT;
CREATE UNIQUE INDEX "OnlineAppointmentRequest_externalRequestId_key"
  ON "OnlineAppointmentRequest"("externalRequestId");

-- Preserve every legacy barcode part before normalizing Product.barcode.
INSERT INTO "ProductBarcode" ("id", "productId", "value", "type", "isPrimary", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       product."id",
       trim(parts.value),
       CASE WHEN trim(parts.value) ~ '^[0-9]{13}$'
         THEN 'EAN13'::"ProductBarcodeType"
         ELSE 'OTHER'::"ProductBarcodeType"
       END,
       false,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Product" product
CROSS JOIN LATERAL regexp_split_to_table(product."barcode", E'[;,\\r\\n]+') AS parts(value)
WHERE product."barcode" IS NOT NULL
  AND product."barcode" ~ E'[;,\\r\\n]'
  AND trim(parts.value) <> ''
ON CONFLICT ("productId", "value") DO NOTHING;

-- Choose the first numeric code as the compatibility/print barcode. All original
-- values remain in ProductBarcode, including non-numeric supplier values.
WITH numeric_codes AS (
  SELECT product."id" AS "productId",
         trim(parts.value) AS value,
         parts.ordinality,
         row_number() OVER (PARTITION BY product."id" ORDER BY parts.ordinality) AS position
  FROM "Product" product
  CROSS JOIN LATERAL regexp_split_to_table(product."barcode", E'[;,\\r\\n]+') WITH ORDINALITY AS parts(value, ordinality)
  WHERE product."barcode" IS NOT NULL
    AND product."barcode" ~ E'[;,\\r\\n]'
    AND trim(parts.value) ~ '^[0-9]{4,32}$'
), selected AS (
  SELECT "productId", value
  FROM numeric_codes
  WHERE position = 1
)
UPDATE "Product" product
SET "barcode" = selected.value
FROM selected
WHERE product."id" = selected."productId";

UPDATE "Product" product
SET "barcode" = NULL
WHERE product."barcode" IS NOT NULL
  AND product."barcode" ~ E'[;,\\r\\n]'
  AND NOT EXISTS (
    SELECT 1
    FROM "ProductBarcode" barcode
    WHERE barcode."productId" = product."id"
      AND barcode."value" ~ '^[0-9]{4,32}$'
  );

UPDATE "ProductBarcode" SET "isPrimary" = false
WHERE "productId" IN (
  SELECT "id" FROM "Product" WHERE "barcode" IS NOT NULL
);

UPDATE "ProductBarcode" barcode
SET "isPrimary" = true
FROM "Product" product
WHERE barcode."productId" = product."id"
  AND barcode."value" = product."barcode";
