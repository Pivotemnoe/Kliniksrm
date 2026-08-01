CREATE TYPE "SessionAccessType" AS ENUM ('LOCAL', 'REMOTE');

ALTER TABLE "Session"
ADD COLUMN "accessType" "SessionAccessType" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN "remoteDeviceId" TEXT;

CREATE TABLE "RemoteAccessPolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "requireTrustedDevice" BOOLEAN NOT NULL DEFAULT true,
  "enrollmentTtlMinutes" INTEGER NOT NULL DEFAULT 10,
  "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 15,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RemoteAccessPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RemoteAccessInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "createdById" TEXT,
  "tokenHash" TEXT NOT NULL,
  "deviceName" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RemoteAccessInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RemoteAccessDevice" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "userAgent" TEXT,
  "lastIpAddress" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "trustedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RemoteAccessDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RemoteAccessPolicy_organizationId_key" ON "RemoteAccessPolicy"("organizationId");
CREATE UNIQUE INDEX "RemoteAccessInvitation_tokenHash_key" ON "RemoteAccessInvitation"("tokenHash");
CREATE INDEX "RemoteAccessInvitation_organizationId_createdAt_idx" ON "RemoteAccessInvitation"("organizationId", "createdAt");
CREATE INDEX "RemoteAccessInvitation_employeeId_createdAt_idx" ON "RemoteAccessInvitation"("employeeId", "createdAt");
CREATE INDEX "RemoteAccessInvitation_expiresAt_idx" ON "RemoteAccessInvitation"("expiresAt");
CREATE UNIQUE INDEX "RemoteAccessDevice_tokenHash_key" ON "RemoteAccessDevice"("tokenHash");
CREATE INDEX "RemoteAccessDevice_organizationId_revokedAt_idx" ON "RemoteAccessDevice"("organizationId", "revokedAt");
CREATE INDEX "RemoteAccessDevice_employeeId_revokedAt_idx" ON "RemoteAccessDevice"("employeeId", "revokedAt");
CREATE INDEX "RemoteAccessDevice_lastSeenAt_idx" ON "RemoteAccessDevice"("lastSeenAt");
CREATE INDEX "Session_remoteDeviceId_idx" ON "Session"("remoteDeviceId");

ALTER TABLE "RemoteAccessPolicy"
ADD CONSTRAINT "RemoteAccessPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteAccessInvitation"
ADD CONSTRAINT "RemoteAccessInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteAccessInvitation"
ADD CONSTRAINT "RemoteAccessInvitation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteAccessInvitation"
ADD CONSTRAINT "RemoteAccessInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RemoteAccessDevice"
ADD CONSTRAINT "RemoteAccessDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteAccessDevice"
ADD CONSTRAINT "RemoteAccessDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session"
ADD CONSTRAINT "Session_remoteDeviceId_fkey" FOREIGN KEY ("remoteDeviceId") REFERENCES "RemoteAccessDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "title", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'remote_access.read', 'Просмотр удалённого доступа', 'Просмотр состояния удалённого доступа и доверенных устройств', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'remote_access.manage', 'Управление удалённым доступом', 'Включение доступа, выдача одноразовых приглашений и отзыв устройств', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN ('remote_access.read', 'remote_access.manage')
WHERE role."code" = 'director'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'remote_access.read'
WHERE role."code" = 'administrator'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
