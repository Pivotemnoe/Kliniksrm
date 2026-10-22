-- Financial reporting is distinct from operational bookkeeping.
UPDATE "Permission" SET title = 'Просмотр прибыли и сводных финансовых отчётов'
WHERE code = 'business.read';
DELETE FROM "RolePermission" rp USING "Role" r, "Permission" p
WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  AND r.code = 'administrator' AND p.code = 'business.read';
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.code = 'administrator' AND p.code IN (
  'stock.read', 'stock.manage', 'billing.read', 'billing.manage', 'payments.manage',
  'daily_finance.read', 'daily_finance.manage', 'daily_finance.submit',
  'payroll.read', 'payroll.manage', 'reports.prevention.read', 'reports.prevention.generate'
) ON CONFLICT DO NOTHING;
-- Remove earlier individual grants as well, without restricting a director.
INSERT INTO "EmployeePermissionOverride" ("employeeId", "permissionId", effect, "createdAt", "updatedAt")
SELECT DISTINCT er."employeeId", p.id, 'DENY'::"PermissionEffect", now(), now()
FROM "EmployeeRole" er JOIN "Role" r ON r.id = er."roleId"
CROSS JOIN "Permission" p
WHERE r.code = 'administrator' AND p.code = 'business.read'
AND NOT EXISTS (
 SELECT 1 FROM "EmployeeRole" dr JOIN "Role" director ON director.id = dr."roleId"
 WHERE dr."employeeId" = er."employeeId" AND director.code = 'director'
)
ON CONFLICT ("employeeId", "permissionId") DO UPDATE SET effect = 'DENY', "updatedAt" = now();
