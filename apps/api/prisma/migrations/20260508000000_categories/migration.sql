-- Sistema de categorías de productos (jerarquía de 2 niveles).
-- Una categoría puede ser padre (parentId NULL) o subcategoría
-- (parentId apunta a un padre). La regla "máximo 2 niveles" se valida
-- en el service layer (no se puede crear una categoría con parentId
-- apuntando a otra que ya tiene parentId).

CREATE TABLE "categories" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "icon"      TEXT,
  "parentId"  TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");
CREATE INDEX "categories_isActive_sortOrder_idx" ON "categories"("isActive", "sortOrder");

-- onDelete Restrict: no se puede borrar un padre con subcategorías.
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Asociación opcional desde productos. Productos existentes quedan con
-- categoryId NULL hasta que el admin los categorice manualmente desde
-- el editor.
ALTER TABLE "products" ADD COLUMN "categoryId" TEXT;

ALTER TABLE "products"
  ADD CONSTRAINT "products_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- Permisos para gestión de categorías. Idempotente: si ya existen no falla.
INSERT INTO "permissions" ("id", "key", "description")
VALUES
  ('cat_perm_read',  'category:read',  'Leer categorías'),
  ('cat_perm_write', 'category:write', 'Crear, editar y eliminar categorías')
ON CONFLICT ("key") DO NOTHING;

-- Asignar al rol admin existente.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'admin'
  AND p."key" IN ('category:read', 'category:write')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Asignar lectura al rol viewer y operator (operación diaria).
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('viewer', 'operator')
  AND p."key" = 'category:read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Asignar escritura al rol operator también.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'operator'
  AND p."key" = 'category:write'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
