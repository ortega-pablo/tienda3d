-- Revert: machine assignment moves from Material to Product. The machine
-- represents where the *product* is manufactured, not which printer a
-- specific filament runs on. Multiple products can share filaments but
-- each product is built on one specific machine.

-- 1. Drop machine assignment from materials (was created in 20260505020000).
ALTER TABLE "materials" DROP CONSTRAINT IF EXISTS "materials_machineId_fkey";
DROP INDEX IF EXISTS "materials_machineId_idx";
ALTER TABLE "materials" DROP COLUMN IF EXISTS "machineId";

-- 2. Add machine assignment to products. Nullable in DB so existing rows can
--    coexist; the service layer enforces presence on create/update.
ALTER TABLE "products" ADD COLUMN "machineId" TEXT;

ALTER TABLE "products"
  ADD CONSTRAINT "products_machineId_fkey"
  FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "products_machineId_idx" ON "products"("machineId");
