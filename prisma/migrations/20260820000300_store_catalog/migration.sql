-- The store is an isolated catalog. It intentionally has no foreign keys to
-- clinic products, services, stock, bills, sales, income or expenses.
CREATE TABLE "StoreProduct" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "categoryTitle" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "retailPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT DEFAULT 'шт',
    "vatRate" DECIMAL(5,2),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreProduct_sku_key" ON "StoreProduct"("sku");
CREATE UNIQUE INDEX "StoreProduct_barcode_key" ON "StoreProduct"("barcode");
CREATE INDEX "StoreProduct_isActive_title_idx" ON "StoreProduct"("isActive", "title");
CREATE INDEX "StoreProduct_categoryTitle_idx" ON "StoreProduct"("categoryTitle");

INSERT INTO "Permission" ("id", "code", "title", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'store.read', 'Просмотр магазина', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'store.manage', 'Управление магазином', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "title" = EXCLUDED."title", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('director', 'administrator', 'cashier', 'stock')
  AND p."code" IN ('store.read', 'store.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
