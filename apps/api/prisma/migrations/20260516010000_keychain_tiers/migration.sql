-- Escala fija para cotizaciones de llaveros personalizados en cantidad.
--
-- La estructura es inmutable (5 filas):
--   1-4   /  5-20  /  25-35  /  40-95  /  100+
-- Solo el markupPct se edita por admin desde /parametros/llaveros.
CREATE TABLE "keychain_tiers" (
  "id"         TEXT          NOT NULL,
  "minQty"     INTEGER       NOT NULL,
  "maxQty"     INTEGER,
  "markupPct"  DECIMAL(6, 2) NOT NULL,
  "sortOrder"  INTEGER       NOT NULL DEFAULT 0,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "keychain_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "keychain_tiers_minQty_key" ON "keychain_tiers"("minQty");

-- Seed: las 5 filas fijas. Los markups iniciales son placeholders editables.
INSERT INTO "keychain_tiers" ("id", "minQty", "maxQty", "markupPct", "sortOrder", "updatedAt")
VALUES
  ('kt_1_4',    1,   4,    100, 1, NOW()),
  ('kt_5_20',   5,   20,   80,  2, NOW()),
  ('kt_25_35',  25,  35,   60,  3, NOW()),
  ('kt_40_95',  40,  95,   50,  4, NOW()),
  ('kt_100_up', 100, NULL, 35,  5, NOW())
ON CONFLICT ("minQty") DO NOTHING;
