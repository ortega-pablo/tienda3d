-- Permisos de la tienda online (plan de unificación, F4·1). Solo para el rol
-- admin: el operador y el viewer no los reciben.

INSERT INTO "permissions" ("id", "key", "description")
VALUES
  ('ecom_perm_read',     'ecommerce:read',     'Ver la gestión de la tienda online'),
  ('ecom_perm_write',    'ecommerce:write',    'Publicar, editar y ocultar productos web, fotos y categorías de la tienda'),
  ('ecom_perm_orders',   'ecommerce:orders',   'Gestionar los pedidos web y las solicitudes de personalización'),
  ('ecom_perm_settings', 'ecommerce:settings', 'Cambiar las condiciones de venta de la tienda (envíos, retiro, transferencia)')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'admin'
  AND p."key" IN ('ecommerce:read', 'ecommerce:write', 'ecommerce:orders', 'ecommerce:settings')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
