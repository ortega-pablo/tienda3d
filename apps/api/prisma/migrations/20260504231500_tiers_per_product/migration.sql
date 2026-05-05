-- Tiers become product-wide instead of per-channel.
-- Step 1: Deduplicate any (productId, minQty) pairs that exist on more than one
-- channel by keeping the row with the lowest markupPct (most conservative).
DELETE FROM "product_price_tiers" t1
USING "product_price_tiers" t2
WHERE
  t1."productId" = t2."productId"
  AND t1."minQty" = t2."minQty"
  AND t1.id <> t2.id
  AND (
    COALESCE(t1."markupPct", 0) > COALESCE(t2."markupPct", 0)
    OR (
      COALESCE(t1."markupPct", 0) = COALESCE(t2."markupPct", 0)
      AND t1.id > t2.id
    )
  );

-- Step 2: drop the per-channel columns and the FK.
ALTER TABLE "product_price_tiers"
  DROP CONSTRAINT IF EXISTS "product_price_tiers_channelId_fkey";

DROP INDEX IF EXISTS "product_price_tiers_productId_channelId_idx";

ALTER TABLE "product_price_tiers"
  DROP COLUMN "channelId",
  DROP COLUMN "commissionPct";

-- Step 3: add a unique constraint so each product has at most one tier per minQty.
CREATE UNIQUE INDEX "product_price_tiers_productId_minQty_key"
  ON "product_price_tiers" ("productId", "minQty");
