-- Producto de catálogo tipo llavero.
--
-- Agrega:
--   - enum ProductKind (STANDARD | KEYCHAIN) + columna products.kind
--   - enum PieceScope (INDIVIDUAL | BATCH) + columna product_pieces.scope
--   - tabla keychain_scale_tiers: grilla global de 5 escalas CONTIGUAS
--     (1-4 / 5-24 / 25-49 / 50-99 / 100+) para el markup de los llaveros
--     de catálogo. Solo el markupPct es editable después.
--
-- Aditiva: los defaults dejan todos los productos existentes como STANDARD y
-- todas las piezas como INDIVIDUAL, sin cambios de comportamiento.

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('STANDARD', 'KEYCHAIN');

-- CreateEnum
CREATE TYPE "PieceScope" AS ENUM ('INDIVIDUAL', 'BATCH');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "product_pieces" ADD COLUMN "scope" "PieceScope" NOT NULL DEFAULT 'INDIVIDUAL';

-- CreateTable
CREATE TABLE "keychain_scale_tiers" (
  "id"         TEXT          NOT NULL,
  "minQty"     INTEGER       NOT NULL,
  "maxQty"     INTEGER,
  "markupPct"  DECIMAL(6, 2) NOT NULL,
  "sortOrder"  INTEGER       NOT NULL DEFAULT 0,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "keychain_scale_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "keychain_scale_tiers_minQty_key" ON "keychain_scale_tiers"("minQty");

-- Seed: las 5 filas fijas contiguas. Markups iniciales editables por admin.
INSERT INTO "keychain_scale_tiers" ("id", "minQty", "maxQty", "markupPct", "sortOrder", "updatedAt")
VALUES
  ('kst_1_4',    1,   4,    100, 1, NOW()),
  ('kst_5_24',   5,   24,   80,  2, NOW()),
  ('kst_25_49',  25,  49,   60,  3, NOW()),
  ('kst_50_99',  50,  99,   50,  4, NOW()),
  ('kst_100_up', 100, NULL, 35,  5, NOW())
ON CONFLICT ("minQty") DO NOTHING;
