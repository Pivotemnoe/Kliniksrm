CREATE TYPE "PortalInviteChannel" AS ENUM ('WEB', 'MAX', 'TELEGRAM');
CREATE TYPE "PortalInviteStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'REVOKED');
CREATE TYPE "MessengerChannel" AS ENUM ('MAX', 'TELEGRAM');

CREATE TABLE "OwnerSnapshot" (
  "ownerId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerSnapshot_pkey" PRIMARY KEY ("ownerId")
);

CREATE TABLE "PortalInvitation" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "channel" "PortalInviteChannel" NOT NULL,
  "status" "PortalInviteStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessengerBinding" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "channel" "MessengerChannel" NOT NULL,
  "externalUserId" TEXT NOT NULL,
  "chatId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessengerBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortalSession" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "inviteId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalInvitation_tokenHash_key" ON "PortalInvitation"("tokenHash");
CREATE INDEX "PortalInvitation_ownerId_status_idx" ON "PortalInvitation"("ownerId", "status");
CREATE INDEX "PortalInvitation_status_expiresAt_idx" ON "PortalInvitation"("status", "expiresAt");
CREATE UNIQUE INDEX "MessengerBinding_ownerId_channel_key" ON "MessengerBinding"("ownerId", "channel");
CREATE UNIQUE INDEX "MessengerBinding_channel_externalUserId_key" ON "MessengerBinding"("channel", "externalUserId");
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");
CREATE INDEX "PortalSession_ownerId_expiresAt_idx" ON "PortalSession"("ownerId", "expiresAt");
CREATE INDEX "PortalSession_expiresAt_revokedAt_idx" ON "PortalSession"("expiresAt", "revokedAt");
CREATE INDEX "OwnerSnapshot_syncedAt_idx" ON "OwnerSnapshot"("syncedAt");

ALTER TABLE "PortalInvitation" ADD CONSTRAINT "PortalInvitation_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessengerBinding" ADD CONSTRAINT "MessengerBinding_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_inviteId_fkey"
  FOREIGN KEY ("inviteId") REFERENCES "PortalInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
