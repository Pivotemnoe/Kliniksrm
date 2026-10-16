-- Grant only the monthly prevention packet, leaving finance and settings unchanged.
INSERT INTO "Permission" ("id", "code", "title", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'reports.prevention.read', 'Просмотр отчётов по вакцинации', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'reports.prevention.generate', 'Формирование отчётов по вакцинации', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" IN ('director', 'administrator')
  AND p."code" IN ('reports.prevention.read', 'reports.prevention.generate')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
