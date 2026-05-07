-- Logic C v3 — replenishment markup per material + global markups for labor
-- and electricity. Profit is no longer computed over the total cost; it is
-- computed over `precio_fabricacion` only. The replenishment markup is what
-- recomposes stock and is *not* part of profit.

-- 1. Per-material replenishment markup. Default 15 %; existing rows backfill
--    explicitly so the historic value is auditable.
ALTER TABLE "materials"
  ADD COLUMN "replenishmentMarkupPct" DECIMAL(6,2) NOT NULL DEFAULT 15;

UPDATE "materials" SET "replenishmentMarkupPct" = 15;

-- 2. Global markups for labor and electricity (5 % each by default). Idempotent
--    insert so re-runs in mixed environments don't fail.
INSERT INTO "global_params" (key, value, description, "updatedAt")
VALUES
  ('labor_markup_pct', '5', 'Recargo extra sobre mano de obra (Logic C v3)', NOW()),
  ('kwh_markup_pct',   '5', 'Recargo extra sobre energía eléctrica (Logic C v3)', NOW())
ON CONFLICT (key) DO NOTHING;
