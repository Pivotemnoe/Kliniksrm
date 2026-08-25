-- Doctors may accept client payments from a bill card.
-- Individual DENY overrides configured by a director remain authoritative.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" = 'doctor'
  AND p."code" = 'payments.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
