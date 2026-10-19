CREATE TABLE "ServiceConsumableRule" (
 "serviceId" TEXT NOT NULL REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "ruleId" TEXT NOT NULL REFERENCES "ConsumableRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 PRIMARY KEY ("serviceId", "ruleId")
);
CREATE INDEX "ServiceConsumableRule_ruleId_idx" ON "ServiceConsumableRule"("ruleId");
CREATE TABLE "ConsumableUsageSnapshot" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "billItemId" TEXT UNIQUE REFERENCES "BillItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "hospitalRecordId" TEXT UNIQUE REFERENCES "HospitalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "recipe" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ConsumableUsageSnapshot_one_owner" CHECK (("billItemId" IS NOT NULL)::int + ("hospitalRecordId" IS NOT NULL)::int = 1)
);
