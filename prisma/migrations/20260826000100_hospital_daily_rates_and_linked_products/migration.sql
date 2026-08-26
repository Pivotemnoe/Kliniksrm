ALTER TABLE "HospitalBox"
  ADD COLUMN "dailyRate" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "HospitalStay"
  ADD COLUMN "dailyRateSnapshot" DECIMAL(12,2);

CREATE TABLE "HospitalStayRatePeriod" (
  "id" TEXT NOT NULL,
  "hospitalStayId" TEXT NOT NULL,
  "hospitalBoxId" TEXT NOT NULL,
  "dailyRate" DECIMAL(12,2) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HospitalStayRatePeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HospitalStayRatePeriod_hospitalStayId_startedAt_idx" ON "HospitalStayRatePeriod"("hospitalStayId", "startedAt");
CREATE INDEX "HospitalStayRatePeriod_hospitalBoxId_idx" ON "HospitalStayRatePeriod"("hospitalBoxId");
ALTER TABLE "HospitalStayRatePeriod"
  ADD CONSTRAINT "HospitalStayRatePeriod_hospitalStayId_fkey"
  FOREIGN KEY ("hospitalStayId") REFERENCES "HospitalStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HospitalStayRatePeriod"
  ADD CONSTRAINT "HospitalStayRatePeriod_hospitalBoxId_fkey"
  FOREIGN KEY ("hospitalBoxId") REFERENCES "HospitalBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ServiceLinkedProduct" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceLinkedProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceLinkedProduct_serviceId_productId_key" ON "ServiceLinkedProduct"("serviceId", "productId");
CREATE INDEX "ServiceLinkedProduct_productId_idx" ON "ServiceLinkedProduct"("productId");
ALTER TABLE "ServiceLinkedProduct"
  ADD CONSTRAINT "ServiceLinkedProduct_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceLinkedProduct"
  ADD CONSTRAINT "ServiceLinkedProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProductLinkedProduct" (
  "id" TEXT NOT NULL,
  "sourceProductId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductLinkedProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductLinkedProduct_sourceProductId_productId_key" ON "ProductLinkedProduct"("sourceProductId", "productId");
CREATE INDEX "ProductLinkedProduct_productId_idx" ON "ProductLinkedProduct"("productId");
ALTER TABLE "ProductLinkedProduct"
  ADD CONSTRAINT "ProductLinkedProduct_sourceProductId_fkey"
  FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductLinkedProduct"
  ADD CONSTRAINT "ProductLinkedProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
