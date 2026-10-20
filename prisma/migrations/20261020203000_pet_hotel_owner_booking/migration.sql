ALTER TABLE "PetHotelSettings"
 ADD COLUMN "selfBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "administratorMaxIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "reminderHours" INTEGER[] NOT NULL DEFAULT ARRAY[24]::INTEGER[];
ALTER TABLE "PetHotelRoom" ADD COLUMN "dailyRate" DECIMAL(12,2),
 ADD CONSTRAINT "PetHotelRoom_nonnegative_rate" CHECK ("dailyRate" IS NULL OR "dailyRate" >= 0);
CREATE TABLE "PetHotelNotification" (
 "id" TEXT PRIMARY KEY,
 "reservationId" TEXT NOT NULL REFERENCES "PetHotelReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "reservationVersion" INTEGER NOT NULL, "event" TEXT NOT NULL,
 "recipientKind" TEXT NOT NULL CHECK ("recipientKind" IN ('OWNER','STAFF')),
 "recipientId" TEXT NOT NULL, "dedupeKey" TEXT NOT NULL, "text" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUEUED', "scheduledAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "attemptedAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0, "sentAt" TIMESTAMP(3), "lastError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PetHotelNotification_dedupeKey_key" ON "PetHotelNotification"("dedupeKey");
CREATE INDEX "PetHotelNotification_status_scheduledAt_idx" ON "PetHotelNotification"("status","scheduledAt");
