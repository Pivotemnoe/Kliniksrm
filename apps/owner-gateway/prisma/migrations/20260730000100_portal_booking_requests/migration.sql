CREATE TYPE "PortalBookingRequestStatus" AS ENUM ('NEW', 'IMPORTED', 'CANCELLED');

CREATE TABLE "PortalBookingRequest" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "animalId" TEXT,
  "animalNickname" TEXT NOT NULL,
  "animalSpecies" TEXT,
  "preferredAt" TIMESTAMP(3),
  "comment" TEXT,
  "contactConsent" BOOLEAN NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'OWNER_PORTAL',
  "status" "PortalBookingRequestStatus" NOT NULL DEFAULT 'NEW',
  "crmRequestId" TEXT,
  "importedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalBookingRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalBookingRequest_ownerId_clientRequestId_key"
  ON "PortalBookingRequest"("ownerId", "clientRequestId");
CREATE INDEX "PortalBookingRequest_status_createdAt_idx"
  ON "PortalBookingRequest"("status", "createdAt");
CREATE INDEX "PortalBookingRequest_ownerId_createdAt_idx"
  ON "PortalBookingRequest"("ownerId", "createdAt");

ALTER TABLE "PortalBookingRequest" ADD CONSTRAINT "PortalBookingRequest_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
