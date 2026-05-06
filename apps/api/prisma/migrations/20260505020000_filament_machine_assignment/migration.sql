-- Filament parents declare which printer they're meant to run on. Operational
-- metadata only — does NOT affect cost calculation (cost stays global via the
-- single active Machine). Required at the service layer for filament parents.

ALTER TABLE "materials" ADD COLUMN "machineId" TEXT;

ALTER TABLE "materials"
  ADD CONSTRAINT "materials_machineId_fkey"
  FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "materials_machineId_idx" ON "materials"("machineId");
