-- Filament hierarchy: introduce parent/child structure for FILAMENT materials.
-- Parents hold price + brand + unit + density + wastePct. Children hold stock + color.
-- Non-filament rows keep parentId NULL forever (enforced in service layer).

-- 1. Schema: add nullable parentId, FK with cascade, index.
ALTER TABLE "materials" ADD COLUMN "parentId" TEXT;

ALTER TABLE "materials"
  ADD CONSTRAINT "materials_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "materials_parentId_idx" ON "materials"("parentId");

-- 2. Backfill: for every existing FILAMENT row, group by brand and create a parent.
--    A NULL brand is treated as its own group ('') so each unbranded filament gets
--    its own parent. Parent inherits unit/density/wastePct from the canonical
--    (most-recently-updated) child, and a single SupplierMaterial price gets
--    promoted to it (the child's current price; ties broken by registeredAt DESC).

-- Create parent rows. Use a deterministic id derived from brand to support reruns.
WITH groups AS (
  SELECT DISTINCT ON (COALESCE(brand, '__no_brand__'))
    COALESCE(brand, '__no_brand__') AS brand_key,
    brand,
    unit,
    "densityGCm3",
    "wastePct"
  FROM "materials"
  WHERE type = 'FILAMENT' AND "parentId" IS NULL
  ORDER BY COALESCE(brand, '__no_brand__'), "updatedAt" DESC
),
inserted_parents AS (
  INSERT INTO "materials" (
    id, name, sku, type, unit, brand, "wastePct", "densityGCm3",
    "currentStock", "minStock", "lowStockAlert", "isActive",
    "createdAt", "updatedAt"
  )
  SELECT
    'fil_parent_' || md5(brand_key)        AS id,
    COALESCE(brand, 'Filamento sin marca') AS name,
    NULL                                   AS sku,
    'FILAMENT'                             AS type,
    unit,
    brand,
    "wastePct",
    "densityGCm3",
    0, 0, FALSE,                           -- parent has no own stock
    TRUE,
    NOW(), NOW()
  FROM groups
  RETURNING id, brand
)
-- 3. Link existing filament rows to their parent.
UPDATE "materials" AS c
SET "parentId" = p.id
FROM inserted_parents p
WHERE c.type = 'FILAMENT'
  AND c."parentId" IS NULL
  AND COALESCE(c.brand, '__no_brand__') = COALESCE(p.brand, '__no_brand__');

-- 4. Promote supplier prices to the parent. For each parent take the canonical
--    child's most-recent isCurrent price and re-point it to the parent. Drop
--    the rest (single-price-per-parent rule, accepted as data loss).
WITH canonical_child AS (
  SELECT DISTINCT ON (c."parentId")
    c.id AS child_id,
    c."parentId" AS parent_id
  FROM "materials" c
  WHERE c."parentId" IS NOT NULL AND c.type = 'FILAMENT'
  ORDER BY c."parentId", c."updatedAt" DESC
),
canonical_price AS (
  SELECT DISTINCT ON (cc.parent_id)
    sm.id AS sm_id,
    cc.parent_id
  FROM canonical_child cc
  JOIN "supplier_materials" sm ON sm."materialId" = cc.child_id
  ORDER BY cc.parent_id, sm."isCurrent" DESC, sm."registeredAt" DESC
)
UPDATE "supplier_materials" AS sm
SET "materialId" = cp.parent_id
FROM canonical_price cp
WHERE sm.id = cp.sm_id;

-- Delete leftover child supplier prices that weren't promoted.
DELETE FROM "supplier_materials" sm
USING "materials" m
WHERE sm."materialId" = m.id
  AND m.type = 'FILAMENT'
  AND m."parentId" IS NOT NULL;

-- 5. Re-point ProductPiece.defaultFilamentId from child → parent so existing
--    pieces stop referencing color-level rows. The piece chooses brand only;
--    color is selected at production-order time.
UPDATE "product_pieces" pp
SET "defaultFilamentId" = m."parentId"
FROM "materials" m
WHERE pp."defaultFilamentId" = m.id
  AND m.type = 'FILAMENT'
  AND m."parentId" IS NOT NULL;

-- 6. Drop stale filament overrides from quote items: cost no longer depends
--    on color (price is at parent), so the field is dead. Snapshots
--    (unitCost/lineTotal) on historical quotes are untouched.
ALTER TABLE "quote_items" DROP COLUMN "filamentOverrides";
