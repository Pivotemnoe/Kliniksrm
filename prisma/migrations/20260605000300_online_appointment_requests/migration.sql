CREATE TYPE "OnlineRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'ACCEPTED', 'CANCELLED', 'ARCHIVED');

CREATE TABLE "OnlineAppointmentRequest" (
    "id" TEXT NOT NULL,
    "status" "OnlineRequestStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'PUBLIC_FORM',
    "ownerName" TEXT NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" TEXT,
    "animalNickname" TEXT NOT NULL,
    "animalSpecies" TEXT,
    "animalBreed" TEXT,
    "preferredAt" TIMESTAMP(3),
    "comment" TEXT,
    "internalComment" TEXT,
    "ownerId" TEXT,
    "animalId" TEXT,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineAppointmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnlineAppointmentRequest_appointmentId_key" ON "OnlineAppointmentRequest"("appointmentId");
CREATE INDEX "OnlineAppointmentRequest_status_createdAt_idx" ON "OnlineAppointmentRequest"("status", "createdAt");
CREATE INDEX "OnlineAppointmentRequest_phone_idx" ON "OnlineAppointmentRequest"("phone");
CREATE INDEX "OnlineAppointmentRequest_ownerId_idx" ON "OnlineAppointmentRequest"("ownerId");
CREATE INDEX "OnlineAppointmentRequest_animalId_idx" ON "OnlineAppointmentRequest"("animalId");

ALTER TABLE "OnlineAppointmentRequest" ADD CONSTRAINT "OnlineAppointmentRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnlineAppointmentRequest" ADD CONSTRAINT "OnlineAppointmentRequest_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnlineAppointmentRequest" ADD CONSTRAINT "OnlineAppointmentRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
