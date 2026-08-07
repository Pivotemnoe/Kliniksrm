-- Catalog deletion is implemented as archiving so historical bills, visits,
-- warehouse movements and clinical records keep their references intact.
ALTER TABLE "Product" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Service" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Product_isActive_title_idx" ON "Product"("isActive", "title");
CREATE INDEX "Service_isActive_title_idx" ON "Service"("isActive", "title");
