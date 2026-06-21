ALTER TABLE "QueueEntry"
ADD COLUMN "lastCalledAt" TIMESTAMP(3),
ADD COLUMN "callCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "QueueEntry_status_lastCalledAt_idx" ON "QueueEntry"("status", "lastCalledAt");
