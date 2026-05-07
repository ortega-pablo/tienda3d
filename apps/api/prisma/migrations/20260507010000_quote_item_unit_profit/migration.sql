-- Logic C v3 — snapshot de ganancia de bolsillo por línea de cotización.
-- El profit absoluto (= fabricationPrice × markup%) queda fijo entre canales,
-- así que un único valor por item alcanza para reportes históricos.

ALTER TABLE "quote_items"
  ADD COLUMN "unitProfit" DECIMAL(14,2) NOT NULL DEFAULT 0;
