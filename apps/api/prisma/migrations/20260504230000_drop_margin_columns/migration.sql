-- Drop deprecated marginPct columns now that pricing uses Logic B
-- (markup over cost lives on Product.targetMarkupPct and ProductPriceTier.markupPct).
ALTER TABLE "channels" DROP COLUMN "marginPct";
ALTER TABLE "product_channels" DROP COLUMN "marginPct";
ALTER TABLE "product_price_tiers" DROP COLUMN "marginPct";
