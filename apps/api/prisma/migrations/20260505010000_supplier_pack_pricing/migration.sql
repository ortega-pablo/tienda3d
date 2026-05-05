-- Pack-based pricing: optional inputs that, when present, derive the per-unit
-- price (e.g. resma de 500 hojas a $17.844 → packSize=500, packPrice=17844,
-- price computed = 35.688 per sheet). The `price` column remains the source
-- of truth for cost calculations; pack fields are display/input metadata.

-- Bump price precision so derived per-unit prices keep accuracy after
-- division (e.g. 17844 / 500 = 35.688, which loses precision at 14,2).
ALTER TABLE "supplier_materials"
  ALTER COLUMN "price" TYPE DECIMAL(14,4);

ALTER TABLE "supplier_materials"
  ADD COLUMN "packSize"  DECIMAL(14,3),
  ADD COLUMN "packPrice" DECIMAL(14,2);
