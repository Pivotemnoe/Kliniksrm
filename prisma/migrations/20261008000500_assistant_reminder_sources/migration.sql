CREATE TABLE "AssistantReminderSource" (
 "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1, "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AssistantReminderSource_ownerId_idx" ON "AssistantReminderSource"("ownerId");
