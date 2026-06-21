ALTER TABLE "ClientPortalAccess"
  ADD COLUMN "loginCodeHash" TEXT,
  ADD COLUMN "loginCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "loginCodeAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ClientPortalAccess_loginCodeExpiresAt_idx" ON "ClientPortalAccess"("loginCodeExpiresAt");
