ALTER TABLE "Bill" ADD COLUMN "dueAt" TIMESTAMP(3);

CREATE INDEX "Bill_dueAt_idx" ON "Bill"("dueAt");
