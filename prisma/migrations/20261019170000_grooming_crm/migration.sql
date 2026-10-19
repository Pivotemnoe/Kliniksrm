BEGIN;

-- CreateTable
CREATE TABLE "GroomingSettings" (
    "installationId" TEXT NOT NULL,
    "selfBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minimumCancelMinutes" INTEGER NOT NULL DEFAULT 120,
    "reminderHours" INTEGER[] DEFAULT ARRAY[24]::INTEGER[],
    "administratorMaxIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingSettings_pkey" PRIMARY KEY ("installationId")
);

-- CreateTable
CREATE TABLE "GroomingSpecialist" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "species" TEXT[] DEFAULT ARRAY['DOG', 'CAT']::TEXT[],
    "maxUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingSpecialist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingServiceRule" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT 'ANY',
    "coat" TEXT NOT NULL DEFAULT 'ANY',
    "durationMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 15,
    "stepMinutes" INTEGER NOT NULL DEFAULT 15,
    "minimumLeadMinutes" INTEGER NOT NULL DEFAULT 60,
    "maximumDaysAhead" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingServiceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingReservation" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "serviceTitle" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "species" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "coat" TEXT NOT NULL DEFAULT 'ANY',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "looks" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'CRM',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingCommandReceipt" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingCommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingNotification" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "reservationVersion" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "recipientKind" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingLocation" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingWorkplace" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingWorkplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingService" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingWorkPeriod" (
    "id" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'WORK',
    "comment" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingWorkPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroomingSpecialist_employeeId_key" ON "GroomingSpecialist"("employeeId");

-- CreateIndex
CREATE INDEX "GroomingServiceRule_installationId_isActive_idx" ON "GroomingServiceRule"("installationId", "isActive");

-- CreateIndex
CREATE INDEX "GroomingReservation_ownerId_startsAt_idx" ON "GroomingReservation"("ownerId", "startsAt");

-- CreateIndex
CREATE INDEX "GroomingReservation_employeeId_startsAt_idx" ON "GroomingReservation"("employeeId", "startsAt");

-- CreateIndex
CREATE INDEX "GroomingReservation_installationId_startsAt_idx" ON "GroomingReservation"("installationId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingNotification_dedupeKey_key" ON "GroomingNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "GroomingNotification_status_scheduledAt_idx" ON "GroomingNotification"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "GroomingWorkPeriod_specialistId_startsAt_idx" ON "GroomingWorkPeriod"("specialistId", "startsAt");

-- CreateIndex
CREATE INDEX "GroomingWorkPeriod_locationId_startsAt_idx" ON "GroomingWorkPeriod"("locationId", "startsAt");

-- AddForeignKey
ALTER TABLE "GroomingSettings" ADD CONSTRAINT "GroomingSettings_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingSpecialist" ADD CONSTRAINT "GroomingSpecialist_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingSpecialist" ADD CONSTRAINT "GroomingSpecialist_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingServiceRule" ADD CONSTRAINT "GroomingServiceRule_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingServiceRule" ADD CONSTRAINT "GroomingServiceRule_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "GroomingSpecialist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingServiceRule" ADD CONSTRAINT "GroomingServiceRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "GroomingService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingServiceRule" ADD CONSTRAINT "GroomingServiceRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GroomingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingServiceRule" ADD CONSTRAINT "GroomingServiceRule_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "GroomingWorkplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "GroomingReservation_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "GroomingReservation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "GroomingServiceRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "GroomingReservation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "GroomingReservation_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "GroomingReservation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "GroomingReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GroomingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "GroomingReservation_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "GroomingWorkplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingNotification" ADD CONSTRAINT "GroomingNotification_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "GroomingReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingLocation" ADD CONSTRAINT "GroomingLocation_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingWorkplace" ADD CONSTRAINT "GroomingWorkplace_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GroomingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingService" ADD CONSTRAINT "GroomingService_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingWorkPeriod" ADD CONSTRAINT "GroomingWorkPeriod_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "GroomingSpecialist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingWorkPeriod" ADD CONSTRAINT "GroomingWorkPeriod_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GroomingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Database-level protection belongs only to the grooming calendar.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "grooming_valid_interval" CHECK ("startsAt" < "endsAt" AND "endsAt" <= "blockedUntil");
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "grooming_valid_status" CHECK (status IN ('CONFIRMED','ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW'));
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "grooming_employee_no_overlap" EXCLUDE USING gist ("employeeId" WITH =, tsrange("startsAt", "blockedUntil", '[)') WITH &&) WHERE (status IN ('CONFIRMED','ARRIVED','IN_PROGRESS'));
ALTER TABLE "GroomingReservation" ADD CONSTRAINT "grooming_workplace_no_overlap" EXCLUDE USING gist ("workplaceId" WITH =, tsrange("startsAt", "blockedUntil", '[)') WITH &&) WHERE (status IN ('CONFIRMED','ARRIVED','IN_PROGRESS'));
ALTER TABLE "GroomingWorkPeriod" ADD CONSTRAINT "grooming_valid_work_period" CHECK ("startsAt" < "endsAt" AND kind IN ('WORK','BLOCK'));
ALTER TABLE "GroomingWorkPeriod" ADD CONSTRAINT "grooming_work_period_no_overlap" EXCLUDE USING gist ("specialistId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("isActive" AND kind = 'WORK');
ALTER TABLE "GroomingServiceRule" ADD CONSTRAINT "grooming_valid_rule" CHECK ("durationMinutes" BETWEEN 5 AND 480 AND "bufferMinutes" BETWEEN 0 AND 120 AND "stepMinutes" BETWEEN 5 AND 60 AND "maximumDaysAhead" BETWEEN 1 AND 90 AND "minimumLeadMinutes" >= 0 AND species IN ('DOG','CAT') AND size IN ('ANY','SMALL','MEDIUM','LARGE') AND coat IN ('ANY','SHORT','LONG','CURLY','DOUBLE'));
ALTER TABLE "GroomingService" ADD CONSTRAINT "grooming_nonnegative_price" CHECK (price >= 0);

INSERT INTO "Permission" (id, code, title, "createdAt", "updatedAt") VALUES
('grooming-module-permission','modules.manage','Подключение дополнений CRM',NOW(),NOW()),
('grooming-read-permission','grooming.read','Просмотр записей груминга',NOW(),NOW()),
('grooming-operate-permission','grooming.operate','Ведение записей груминга',NOW(),NOW()),
('grooming-manage-permission','grooming.manage','Настройка груминга',NOW(),NOW()),
('grooming-schedule-permission','grooming.schedule','Управление расписанием груминга',NOW(),NOW()) ON CONFLICT (code) DO NOTHING;
INSERT INTO "Role" (id,code,title,"createdAt","updatedAt") VALUES ('grooming-role-v1','groomer','Грумер',NOW(),NOW()) ON CONFLICT (code) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE (r.code='director' AND p.code IN ('modules.manage','grooming.read','grooming.operate','grooming.manage','grooming.schedule'))
OR (r.code='administrator' AND p.code IN ('grooming.read','grooming.operate','grooming.schedule'))
OR (r.code='groomer' AND p.code IN ('grooming.read','grooming.operate')) ON CONFLICT DO NOTHING;

COMMIT;
