-- Administrators manage hotel rooms and tariffs inside the hotel module.
-- Enabling/disabling modules still requires the separate modules.manage permission.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.code = 'administrator' AND p.code = 'pet_hotel.manage'
ON CONFLICT DO NOTHING;
