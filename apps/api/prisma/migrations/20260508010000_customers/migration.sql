-- Customers (B2B): mayoristas, consignación y especiales.
-- STANDARD = walk-in, no se persiste (se mantiene como string libre en Quote).

-- 1. Enums
CREATE TYPE "CustomerType" AS ENUM ('STANDARD', 'WHOLESALE', 'CONSIGNMENT', 'SPECIAL');
CREATE TYPE "CustomerSuspensionReason" AS ENUM ('MONTHLY_COMMITMENT_MISSED', 'MANUAL_ADMIN');

-- 2. Tabla Customer
CREATE TABLE "customers" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "type"            "CustomerType" NOT NULL DEFAULT 'WHOLESALE',
  "email"           TEXT,
  "phone"           TEXT,
  "taxId"           TEXT,
  "notes"           TEXT,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "skipChannelCommission" BOOLEAN NOT NULL DEFAULT false,
  "skipMarketing"         BOOLEAN NOT NULL DEFAULT false,
  "skipRegime"            BOOLEAN NOT NULL DEFAULT false,
  "skipReinvestment"      BOOLEAN NOT NULL DEFAULT false,
  "defaultChannelId"      TEXT,
  "hasPortalAccess"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");
CREATE INDEX "customers_type_isActive_idx" ON "customers"("type", "isActive");
CREATE INDEX "customers_defaultChannelId_idx" ON "customers"("defaultChannelId");

-- onDelete SET NULL: si se borra el canal, queda el cliente sin default
-- (el portal pedirá elegir canal hasta que el admin lo recargue).
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_defaultChannelId_fkey"
  FOREIGN KEY ("defaultChannelId") REFERENCES "channels"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Tabla CustomerProduct (catálogo de cliente SPECIAL)
CREATE TABLE "customer_products" (
  "customerId"      TEXT NOT NULL,
  "productId"       TEXT NOT NULL,
  "customMarkupPct" DECIMAL(6, 2),
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_products_pkey" PRIMARY KEY ("customerId", "productId")
);

CREATE INDEX "customer_products_productId_idx" ON "customer_products"("productId");

ALTER TABLE "customer_products"
  ADD CONSTRAINT "customer_products_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_products"
  ADD CONSTRAINT "customer_products_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Tabla CustomerCategoryCommitment (mayorista por categoría)
CREATE TABLE "customer_category_commitments" (
  "id"                   TEXT NOT NULL,
  "customerId"           TEXT NOT NULL,
  "categoryId"           TEXT NOT NULL,
  "minTierQty"           INTEGER,
  "monthlyCommitmentQty" INTEGER,
  "isWholesaleSuspended" BOOLEAN NOT NULL DEFAULT false,
  "suspensionReason"     "CustomerSuspensionReason",
  "suspendedAt"          TIMESTAMP(3),
  "notes"                TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_category_commitments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_category_commitments_customerId_categoryId_key"
  ON "customer_category_commitments"("customerId", "categoryId");
CREATE INDEX "customer_category_commitments_categoryId_idx"
  ON "customer_category_commitments"("categoryId");

ALTER TABLE "customer_category_commitments"
  ADD CONSTRAINT "customer_category_commitments_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- onDelete Restrict: no borrar una categoría con compromisos activos.
ALTER TABLE "customer_category_commitments"
  ADD CONSTRAINT "customer_category_commitments_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Tabla CustomerMonthlyVolume (tracking mensual por categoría)
CREATE TABLE "customer_monthly_volumes" (
  "id"           TEXT NOT NULL,
  "customerId"   TEXT NOT NULL,
  "categoryId"   TEXT NOT NULL,
  "monthStart"   TIMESTAMP(3) NOT NULL,
  "unitsSold"    DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "committedQty" INTEGER,
  "unfulfilled"  BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "customer_monthly_volumes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_monthly_volumes_customerId_categoryId_monthStart_key"
  ON "customer_monthly_volumes"("customerId", "categoryId", "monthStart");
CREATE INDEX "customer_monthly_volumes_monthStart_idx"
  ON "customer_monthly_volumes"("monthStart");

ALTER TABLE "customer_monthly_volumes"
  ADD CONSTRAINT "customer_monthly_volumes_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_monthly_volumes"
  ADD CONSTRAINT "customer_monthly_volumes_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Modificaciones a Quote: customerId + customerProfileSnapshot
ALTER TABLE "quotes" ADD COLUMN "customerId"              TEXT;
ALTER TABLE "quotes" ADD COLUMN "customerProfileSnapshot" JSONB;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "quotes_customerId_idx" ON "quotes"("customerId");

-- 7. Modificación a User: customerId (1:1) para portal
ALTER TABLE "users" ADD COLUMN "customerId" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "users_customerId_key" ON "users"("customerId");

-- 8. Permisos staff (gestión de clientes)
INSERT INTO "permissions" ("id", "key", "description")
VALUES
  ('cust_perm_read',  'customer:read',  'Leer clientes'),
  ('cust_perm_write', 'customer:write', 'Crear, editar y eliminar clientes'),
  ('cust_perm_portal_manage', 'customer:portal:manage', 'Gestionar cuentas de portal de los clientes')
ON CONFLICT ("key") DO NOTHING;

-- 9. Permisos del portal (para el rol customer-portal)
INSERT INTO "permissions" ("id", "key", "description")
VALUES
  ('portal_perm_catalog',  'portal:catalog:read',  'Portal: ver catálogo personalizado'),
  ('portal_perm_order',    'portal:order:create',  'Portal: generar pedidos'),
  ('portal_perm_profile',  'portal:profile:edit',  'Portal: editar perfil propio')
ON CONFLICT ("key") DO NOTHING;

-- 10. Asignar permisos staff a admin + operator
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'admin'
  AND p."key" IN ('customer:read', 'customer:write', 'customer:portal:manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'operator'
  AND p."key" IN ('customer:read', 'customer:write')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'viewer'
  AND p."key" = 'customer:read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 11. Crear el rol customer-portal y asignarle sus permisos.
-- isSystem=true: no se puede borrar desde la UI; lo gestiona la app.
INSERT INTO "roles" ("id", "name", "description", "isSystem", "updatedAt")
VALUES (
  'role_customer_portal',
  'customer-portal',
  'Cuenta de portal de un cliente. Acceso limitado a catálogo y pedidos propios.',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'customer-portal'
  AND p."key" IN ('portal:catalog:read', 'portal:order:create', 'portal:profile:edit')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
