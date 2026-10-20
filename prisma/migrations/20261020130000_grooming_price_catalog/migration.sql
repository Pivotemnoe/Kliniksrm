ALTER TABLE "GroomingService" ADD COLUMN "catalogKey" TEXT, ADD COLUMN "catalogData" JSONB, ADD COLUMN "priceType" TEXT NOT NULL DEFAULT 'FIXED', ADD COLUMN "maximumPrice" DECIMAL(12,2);
CREATE UNIQUE INDEX "GroomingService_installationId_catalogKey_key" ON "GroomingService"("installationId", "catalogKey");
ALTER TABLE "GroomingReservation" ADD COLUMN "priceType" TEXT NOT NULL DEFAULT 'FIXED', ADD COLUMN "maximumPrice" DECIMAL(12,2);
