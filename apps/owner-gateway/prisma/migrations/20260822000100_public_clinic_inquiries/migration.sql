CREATE TYPE "PublicClinicInquiryStatus" AS ENUM ('NEW', 'IMPORTED', 'CANCELLED');

CREATE TABLE "PublicClinicInquiry" (
  "id" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "animalNickname" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "contactConsent" BOOLEAN NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'CLINIC_SITE_CHAT',
  "status" "PublicClinicInquiryStatus" NOT NULL DEFAULT 'NEW',
  "crmRequestId" TEXT,
  "importedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicClinicInquiry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicClinicInquiry_clientRequestId_key"
  ON "PublicClinicInquiry"("clientRequestId");
CREATE INDEX "PublicClinicInquiry_status_createdAt_idx"
  ON "PublicClinicInquiry"("status", "createdAt");
CREATE INDEX "PublicClinicInquiry_phone_createdAt_idx"
  ON "PublicClinicInquiry"("phone", "createdAt");
