-- Plan: docs/plans/category-driven-pricing.md (Fase 1)
--
-- Las escalas pasan de producto a categoría/subcategoría. Esta migración:
--   1) Crea Category.baseMarkupPct y la tabla category_price_tiers.
--   2) Crea la categoría seed "sin-clasificar" para alojar productos huérfanos.
--   3) Reasigna productos sin categoría y vuelve `categoryId` NOT NULL.
--   4) Elimina Product.targetMarkupPct, la tabla product_price_tiers y
--      Customer.defaultChannelId (decisiones 4, 5 y 12 del plan).
--
-- Limpieza total: no se migran datos de product_price_tiers. Las escalas
-- se cargan de cero a nivel categoría desde /categorias/:id (Fase 4).

-- 1.a) Markup base de categoría. NULL permitido para que una subcategoría
--      pueda heredar del padre sin tener uno propio.
ALTER TABLE "categories" ADD COLUMN "baseMarkupPct" DECIMAL(6,2);

-- 1.b) Tabla de escalas por categoría y canal.
CREATE TABLE "category_price_tiers" (
  "id"         TEXT          NOT NULL,
  "categoryId" TEXT          NOT NULL,
  "channelId"  TEXT          NOT NULL,
  "minQty"     INTEGER       NOT NULL,
  "maxQty"     INTEGER,
  "markupPct"  DECIMAL(6,2)  NOT NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "category_price_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_price_tiers_categoryId_channelId_minQty_key"
  ON "category_price_tiers"("categoryId", "channelId", "minQty");
CREATE INDEX "category_price_tiers_categoryId_channelId_idx"
  ON "category_price_tiers"("categoryId", "channelId");

ALTER TABLE "category_price_tiers"
  ADD CONSTRAINT "category_price_tiers_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_price_tiers"
  ADD CONSTRAINT "category_price_tiers_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Categoría seed "sin-clasificar": id estable para que `seed.ts`
--    pueda hacer upsert idempotente. baseMarkupPct = 100 (placeholder).
INSERT INTO "categories" ("id", "name", "slug", "isActive", "sortOrder", "baseMarkupPct", "createdAt", "updatedAt")
VALUES ('cat_unsorted', 'Sin clasificar', 'sin-clasificar', true, 9999, 100, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

-- 3) Reasignar productos huérfanos antes de hacer NOT NULL.
UPDATE "products"
SET "categoryId" = 'cat_unsorted'
WHERE "categoryId" IS NULL;

ALTER TABLE "products" ALTER COLUMN "categoryId" SET NOT NULL;

-- 4.a) Drop targetMarkupPct: el markup ahora viene 100% de la categoría.
ALTER TABLE "products" DROP COLUMN "targetMarkupPct";

-- 4.b) Drop tabla de escalas por producto (limpieza total).
DROP TABLE "product_price_tiers" CASCADE;

-- 4.c) Drop defaultChannelId del cliente (decisión 12 del plan):
--      el canal se deriva del checkbox "sin factura", no se persiste por cliente.
DROP INDEX IF EXISTS "customers_defaultChannelId_idx";
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_defaultChannelId_fkey";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "defaultChannelId";
