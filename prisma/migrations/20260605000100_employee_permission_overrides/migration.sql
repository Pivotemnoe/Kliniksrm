CREATE TYPE "PermissionEffect" AS ENUM ('GRANT', 'DENY');

CREATE TABLE "EmployeePermissionOverride" (
    "employeeId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePermissionOverride_pkey" PRIMARY KEY ("employeeId","permissionId")
);

CREATE INDEX "EmployeePermissionOverride_permissionId_idx" ON "EmployeePermissionOverride"("permissionId");

ALTER TABLE "EmployeePermissionOverride" ADD CONSTRAINT "EmployeePermissionOverride_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeePermissionOverride" ADD CONSTRAINT "EmployeePermissionOverride_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
