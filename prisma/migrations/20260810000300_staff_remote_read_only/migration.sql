ALTER TABLE "Employee"
ADD COLUMN "allowRemoteOutsideShift" BOOLEAN NOT NULL DEFAULT false;

-- Управление удалённым доступом доступно только директору. Удаляем ранее
-- выданное типовой роли администратора право просмотра этого раздела.
DELETE FROM "RolePermission"
WHERE "roleId" IN (
  SELECT "id" FROM "Role" WHERE "code" = 'administrator'
)
AND "permissionId" IN (
  SELECT "id" FROM "Permission" WHERE "code" IN ('remote_access.read', 'remote_access.manage')
);
