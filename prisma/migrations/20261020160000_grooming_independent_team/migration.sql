BEGIN;
ALTER TABLE "Employee" ADD COLUMN "accountScope" TEXT NOT NULL DEFAULT 'CLINIC';
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_account_scope" CHECK ("accountScope" IN ('CLINIC','GROOMING'));
ALTER TABLE "GroomingWorkPeriod" ADD COLUMN "workplaceId" TEXT REFERENCES "GroomingWorkplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GroomingWorkPeriod_workplaceId_startsAt_idx" ON "GroomingWorkPeriod"("workplaceId","startsAt");
ALTER TABLE "GroomingService" ADD CONSTRAINT "GroomingService_price_type" CHECK ("priceType" IN ('FIXED','RANGE','UP_TO','QUOTE','PERCENT'));
ALTER TABLE "GroomingService" ADD CONSTRAINT "GroomingService_price_range" CHECK ("maximumPrice" IS NULL OR "maximumPrice" >= "price");
-- Administrators set up their grooming team and price list inside this module.
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.code='administrator' AND p.code='grooming.manage' ON CONFLICT DO NOTHING;
COMMIT;
