ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'MESSENGER';

ALTER TABLE "Vaccination"
ADD COLUMN "ownerReminderEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "NotificationOutbox"
ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key"
ON "NotificationOutbox"("dedupeKey");
