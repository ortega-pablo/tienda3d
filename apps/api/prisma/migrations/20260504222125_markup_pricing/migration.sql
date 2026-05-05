-- Add markup-based pricing columns (Logic B).
ALTER TABLE "product_price_tiers" ADD COLUMN "markupPct" DECIMAL(6, 2);
ALTER TABLE "products" ADD COLUMN "targetMarkupPct" DECIMAL(6, 2) NOT NULL DEFAULT 60;

-- Backfill targetMarkupPct for existing products by converting the default
-- margin-on-price (35%) plus Venta Directa commission (6.5%) and regime (4%)
-- into the equivalent markup-on-cost that preserves the Directa price:
--
--   markup = margin / (1 - margin - direct_commission - regime)
--          = 0.35 / (1 - 0.35 - 0.065 - 0.04) = 0.6422 ≈ 64.22 %
UPDATE "products" SET "targetMarkupPct" = 64.22;

-- Backfill markupPct for tiers that had a marginPct override using the same
-- formula (assuming Directa-style deductions). Tiers without override stay NULL
-- and inherit the product's markup at runtime.
UPDATE "product_price_tiers"
SET "markupPct" = ROUND(
  ("marginPct"::numeric) / (100 - "marginPct"::numeric - 6.5 - 4) * 100,
  2
)
WHERE "marginPct" IS NOT NULL;
