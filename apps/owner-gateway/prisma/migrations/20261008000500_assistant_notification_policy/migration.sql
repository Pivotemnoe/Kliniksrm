CREATE TABLE "OwnerNotificationPreference" (
 "ownerId" TEXT PRIMARY KEY REFERENCES "OwnerSnapshot"("ownerId") ON DELETE CASCADE,
 "enabled" BOOLEAN NOT NULL DEFAULT false,
 "appointmentChanges" BOOLEAN NOT NULL DEFAULT false,
 "appointmentReminders" BOOLEAN NOT NULL DEFAULT false,
 "revisitReminders" BOOLEAN NOT NULL DEFAULT false,
 "vaccinationReminders" BOOLEAN NOT NULL DEFAULT false,
 "channel" "MessengerChannel" NOT NULL DEFAULT 'MAX',
 "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
 "quietStartMinute" INTEGER NOT NULL DEFAULT 1320 CHECK ("quietStartMinute" BETWEEN 0 AND 1439),
 "quietEndMinute" INTEGER NOT NULL DEFAULT 480 CHECK ("quietEndMinute" BETWEEN 0 AND 1439),
 "version" INTEGER NOT NULL DEFAULT 1,
 "consentAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "OwnerNotificationDelivery" (
 "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "OwnerSnapshot"("ownerId") ON DELETE CASCADE,
 "fingerprint" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL,
 "consentVersion" INTEGER NOT NULL, "channel" "MessengerChannel" NOT NULL,
 "dayKey" TEXT NOT NULL, "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3), "providerMessageId" TEXT, "error" TEXT
);
CREATE INDEX "OwnerNotificationDelivery_ownerId_dayKey_attemptedAt_idx" ON "OwnerNotificationDelivery"("ownerId", "dayKey", "attemptedAt");
CREATE INDEX "OwnerNotificationDelivery_status_attemptedAt_idx" ON "OwnerNotificationDelivery"("status", "attemptedAt");
