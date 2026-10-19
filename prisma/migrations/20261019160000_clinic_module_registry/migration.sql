BEGIN;
CREATE TABLE "ClinicModuleInstallation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicModuleInstallation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicModuleInstallation_organizationId_moduleKey_key" ON "ClinicModuleInstallation"("organizationId", "moduleKey");
ALTER TABLE "ClinicModuleInstallation" ADD CONSTRAINT "ClinicModuleInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
