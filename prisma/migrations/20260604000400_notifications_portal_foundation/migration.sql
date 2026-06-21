CREATE TYPE "NotificationChannel" AS ENUM ('INTERNAL', 'TELEGRAM', 'MAX', 'SMS', 'EMAIL', 'PUSH');
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "ClientPortalStatus" AS ENUM ('DISABLED', 'ENABLED', 'INVITED', 'BLOCKED');

ALTER TABLE "Owner" ADD COLUMN "preferredNotificationChannel" "NotificationChannel";
ALTER TABLE "Owner" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "Owner" ADD COLUMN "maxUserId" TEXT;
ALTER TABLE "Owner" ADD COLUMN "allowSms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Owner" ADD COLUMN "allowTelegram" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Owner" ADD COLUMN "allowMax" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Owner" ADD COLUMN "allowEmail" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ClientPortalAccess" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" "ClientPortalStatus" NOT NULL DEFAULT 'DISABLED',
  "inviteTokenHash" TEXT,
  "inviteExpiresAt" TIMESTAMP(3),
  "invitedAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "blockedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientPortalAccess_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NotificationTemplate" ADD COLUMN "subject" TEXT;
ALTER TABLE "NotificationTemplate" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT,
  "animalId" TEXT,
  "templateId" TEXT,
  "createdById" TEXT,
  "channel" "NotificationChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientPortalAccess_ownerId_key" ON "ClientPortalAccess"("ownerId");
CREATE INDEX "ClientPortalAccess_status_idx" ON "ClientPortalAccess"("status");
CREATE INDEX "NotificationTemplate_isActive_idx" ON "NotificationTemplate"("isActive");
CREATE INDEX "NotificationOutbox_status_scheduledAt_idx" ON "NotificationOutbox"("status", "scheduledAt");
CREATE INDEX "NotificationOutbox_channel_idx" ON "NotificationOutbox"("channel");
CREATE INDEX "NotificationOutbox_ownerId_idx" ON "NotificationOutbox"("ownerId");
CREATE INDEX "NotificationOutbox_animalId_idx" ON "NotificationOutbox"("animalId");

ALTER TABLE "ClientPortalAccess"
ADD CONSTRAINT "ClientPortalAccess_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "Owner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox"
ADD CONSTRAINT "NotificationOutbox_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "Owner"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox"
ADD CONSTRAINT "NotificationOutbox_animalId_fkey"
FOREIGN KEY ("animalId") REFERENCES "Animal"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox"
ADD CONSTRAINT "NotificationOutbox_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox"
ADD CONSTRAINT "NotificationOutbox_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "Employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
