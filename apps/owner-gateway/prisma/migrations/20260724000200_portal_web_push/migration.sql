CREATE TABLE "PortalPushSubscription" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalPushSubscription_endpoint_key" ON "PortalPushSubscription"("endpoint");
CREATE INDEX "PortalPushSubscription_ownerId_disabledAt_idx" ON "PortalPushSubscription"("ownerId", "disabledAt");
CREATE INDEX "PortalPushSubscription_sessionId_idx" ON "PortalPushSubscription"("sessionId");

ALTER TABLE "PortalPushSubscription" ADD CONSTRAINT "PortalPushSubscription_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalPushSubscription" ADD CONSTRAINT "PortalPushSubscription_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "PortalSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
