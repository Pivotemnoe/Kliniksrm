CREATE TABLE "PetHotelStaffDelivery" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PetHotelStaffDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PetHotelStaffDelivery_status_attemptedAt_idx" ON "PetHotelStaffDelivery"("status", "attemptedAt");
