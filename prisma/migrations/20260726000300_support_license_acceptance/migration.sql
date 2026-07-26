-- Этапы 5-6: только новые служебные таблицы. Клинические данные не изменяются.
CREATE TYPE "SupportRequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CLINIC', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportRequestPriority" AS ENUM ('NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "ClinicLicenseStatus" AS ENUM ('COMPATIBILITY', 'UNLICENSED', 'VALID', 'EXPIRED', 'INVALID', 'MISMATCH');
CREATE TYPE "ServerAcceptanceStatus" AS ENUM ('PREPARED', 'VERIFIED', 'ACCEPTED', 'REJECTED');

CREATE TABLE "ClinicInstallation" (
  "id" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "organizationId" TEXT,
  "licenseId" TEXT,
  "licenseCustomer" TEXT,
  "licensePayload" JSONB,
  "licenseSignature" TEXT,
  "licenseStatus" "ClinicLicenseStatus" NOT NULL DEFAULT 'COMPATIBILITY',
  "licenseValidUntil" TIMESTAMP(3),
  "licenseCheckedAt" TIMESTAMP(3),
  "licenseMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportRequest" (
  "id" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "createdById" TEXT,
  "handledById" TEXT,
  "status" "SupportRequestStatus" NOT NULL DEFAULT 'NEW',
  "priority" "SupportRequestPriority" NOT NULL DEFAULT 'NORMAL',
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "contact" TEXT,
  "diagnosticConsentAt" TIMESTAMP(3),
  "diagnosticSnapshot" JSONB,
  "diagnosticSha256" TEXT,
  "externalReference" TEXT,
  "response" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServerAcceptance" (
  "id" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "preparedById" TEXT,
  "acceptedById" TEXT,
  "status" "ServerAcceptanceStatus" NOT NULL DEFAULT 'PREPARED',
  "releaseVersion" TEXT NOT NULL,
  "releaseRevision" TEXT,
  "sourceServer" TEXT,
  "targetServer" TEXT,
  "archiveName" TEXT NOT NULL,
  "archiveSha256" TEXT NOT NULL,
  "sourceCounts" JSONB NOT NULL,
  "targetCounts" JSONB,
  "verificationReport" JSONB NOT NULL,
  "notes" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServerAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicInstallation_installationId_key" ON "ClinicInstallation"("installationId");
CREATE UNIQUE INDEX "ClinicInstallation_organizationId_key" ON "ClinicInstallation"("organizationId");
CREATE INDEX "ClinicInstallation_licenseStatus_idx" ON "ClinicInstallation"("licenseStatus");
CREATE INDEX "ClinicInstallation_licenseValidUntil_idx" ON "ClinicInstallation"("licenseValidUntil");
CREATE INDEX "SupportRequest_installationId_status_createdAt_idx" ON "SupportRequest"("installationId", "status", "createdAt");
CREATE INDEX "SupportRequest_createdById_createdAt_idx" ON "SupportRequest"("createdById", "createdAt");
CREATE INDEX "ServerAcceptance_installationId_status_createdAt_idx" ON "ServerAcceptance"("installationId", "status", "createdAt");
CREATE INDEX "ServerAcceptance_archiveSha256_idx" ON "ServerAcceptance"("archiveSha256");

ALTER TABLE "ClinicInstallation" ADD CONSTRAINT "ClinicInstallation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "ClinicInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_handledById_fkey"
  FOREIGN KEY ("handledById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServerAcceptance" ADD CONSTRAINT "ServerAcceptance_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "ClinicInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServerAcceptance" ADD CONSTRAINT "ServerAcceptance_preparedById_fkey"
  FOREIGN KEY ("preparedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServerAcceptance" ADD CONSTRAINT "ServerAcceptance_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "title", "createdAt", "updatedAt") VALUES
  ('66666666-6666-4666-8666-000000000001', 'support.read', 'Просмотр обращений в поддержку', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('66666666-6666-4666-8666-000000000002', 'support.manage', 'Создание и ведение обращений в поддержку', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('66666666-6666-4666-8666-000000000003', 'license.manage', 'Управление лицензией установки', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('66666666-6666-4666-8666-000000000004', 'acceptance.manage', 'Финальная приёмка нового сервера', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "title" = EXCLUDED."title", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN ('support.read', 'support.manage', 'license.manage', 'acceptance.manage')
WHERE role."code" = 'director'
ON CONFLICT DO NOTHING;
