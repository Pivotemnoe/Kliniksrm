-- A doctor can create and correct owner cards by default.
-- Individual DENY overrides configured by a director remain authoritative.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" = 'doctor'
  AND p."code" = 'owners.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
