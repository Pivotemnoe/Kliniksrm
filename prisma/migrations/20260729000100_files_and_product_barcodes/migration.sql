-- Additive foundation for private medical/laboratory/supply attachments and
-- multiple product barcodes. Existing clinic records are not rewritten or deleted.

CREATE TYPE "FilePurpose" AS ENUM (
  'MEDICAL_DOCUMENT',
  'LABORATORY_RESULT',
  'SUPPLY_DOCUMENT'
);

CREATE TYPE "ProductBarcodeType" AS ENUM (
  'EAN13',
  'GTIN',
  'INTERNAL',
  'SUPPLIER',
  'OTHER'
);

ALTER TABLE "FileObject"
  ADD COLUMN "visitDocumentId" TEXT,
  ADD COLUMN "laboratoryOrderId" TEXT,
  ADD COLUMN "laboratoryOrderItemId" TEXT,
  ADD COLUMN "supplyInvoiceId" TEXT,
  ADD COLUMN "uploadedById" TEXT,
  ADD COLUMN "purpose" "FilePurpose" NOT NULL DEFAULT 'MEDICAL_DOCUMENT',
  ADD COLUMN "checksumSha256" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "ProductBarcode" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "type" "ProductBarcodeType" NOT NULL DEFAULT 'OTHER',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductBarcode_productId_value_key" ON "ProductBarcode"("productId", "value");
CREATE INDEX "ProductBarcode_value_idx" ON "ProductBarcode"("value");
CREATE INDEX "ProductBarcode_productId_isPrimary_idx" ON "ProductBarcode"("productId", "isPrimary");

-- Preserve the existing primary barcode in the new multi-barcode catalog.
INSERT INTO "ProductBarcode" ("id", "productId", "value", "type", "isPrimary", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       "id",
       trim("barcode"),
       CASE WHEN trim("barcode") ~ '^[0-9]{13}$' THEN 'EAN13'::"ProductBarcodeType" ELSE 'OTHER'::"ProductBarcodeType" END,
       true,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Product"
WHERE "barcode" IS NOT NULL
  AND trim("barcode") <> ''
  AND position(';' in "barcode") = 0;

-- Imported catalogs can contain several barcodes in one legacy field. Split them
-- into separate searchable records while leaving the legacy value untouched.
INSERT INTO "ProductBarcode" ("id", "productId", "value", "type", "isPrimary", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       product."id",
       trim(parts.value),
       CASE WHEN trim(parts.value) ~ '^[0-9]{13}$' THEN 'EAN13'::"ProductBarcodeType" ELSE 'OTHER'::"ProductBarcodeType" END,
       parts.ordinality = 1,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Product" product
CROSS JOIN LATERAL unnest(string_to_array(product."barcode", ';')) WITH ORDINALITY AS parts(value, ordinality)
WHERE product."barcode" IS NOT NULL
  AND position(';' in product."barcode") > 0
  AND trim(parts.value) <> ''
ON CONFLICT ("productId", "value") DO NOTHING;

CREATE INDEX "FileObject_visitDocumentId_idx" ON "FileObject"("visitDocumentId");
CREATE INDEX "FileObject_laboratoryOrderId_idx" ON "FileObject"("laboratoryOrderId");
CREATE INDEX "FileObject_laboratoryOrderItemId_idx" ON "FileObject"("laboratoryOrderItemId");
CREATE INDEX "FileObject_supplyInvoiceId_idx" ON "FileObject"("supplyInvoiceId");
CREATE INDEX "FileObject_uploadedById_idx" ON "FileObject"("uploadedById");
CREATE INDEX "FileObject_purpose_createdAt_idx" ON "FileObject"("purpose", "createdAt");
CREATE INDEX "FileObject_deletedAt_idx" ON "FileObject"("deletedAt");

ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_visitDocumentId_fkey"
  FOREIGN KEY ("visitDocumentId") REFERENCES "VisitDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_laboratoryOrderId_fkey"
  FOREIGN KEY ("laboratoryOrderId") REFERENCES "LaboratoryOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_laboratoryOrderItemId_fkey"
  FOREIGN KEY ("laboratoryOrderItemId") REFERENCES "LaboratoryOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_supplyInvoiceId_fkey"
  FOREIGN KEY ("supplyInvoiceId") REFERENCES "SupplyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
