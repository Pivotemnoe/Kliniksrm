CREATE TYPE "LaboratoryOrderStatus" AS ENUM ('ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "LaboratoryOrderItemStatus" AS ENUM ('ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "LaboratoryOrder" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "status" "LaboratoryOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "comment" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaboratoryOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaboratoryOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "testId" TEXT,
    "profileId" TEXT,
    "billItemId" TEXT,
    "status" "LaboratoryOrderItemStatus" NOT NULL DEFAULT 'ORDERED',
    "title" TEXT NOT NULL,
    "code" TEXT,
    "groupName" TEXT,
    "material" TEXT,
    "method" TEXT,
    "unit" TEXT,
    "referenceRange" TEXT,
    "resultValue" TEXT,
    "resultText" TEXT,
    "comment" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaboratoryOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LaboratoryOrder_visitId_idx" ON "LaboratoryOrder"("visitId");
CREATE INDEX "LaboratoryOrder_status_createdAt_idx" ON "LaboratoryOrder"("status", "createdAt");
CREATE INDEX "LaboratoryOrder_createdById_idx" ON "LaboratoryOrder"("createdById");
CREATE INDEX "LaboratoryOrderItem_orderId_idx" ON "LaboratoryOrderItem"("orderId");
CREATE INDEX "LaboratoryOrderItem_testId_idx" ON "LaboratoryOrderItem"("testId");
CREATE INDEX "LaboratoryOrderItem_profileId_idx" ON "LaboratoryOrderItem"("profileId");
CREATE INDEX "LaboratoryOrderItem_billItemId_idx" ON "LaboratoryOrderItem"("billItemId");
CREATE INDEX "LaboratoryOrderItem_status_idx" ON "LaboratoryOrderItem"("status");

ALTER TABLE "LaboratoryOrder" ADD CONSTRAINT "LaboratoryOrder_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaboratoryOrderItem" ADD CONSTRAINT "LaboratoryOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LaboratoryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaboratoryOrderItem" ADD CONSTRAINT "LaboratoryOrderItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LaboratoryTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LaboratoryOrderItem" ADD CONSTRAINT "LaboratoryOrderItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LaboratoryProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LaboratoryOrderItem" ADD CONSTRAINT "LaboratoryOrderItem_billItemId_fkey" FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
