-- Snapshot del desglose de cálculo por ítem de cotización (costo + precio +
-- contexto), para mostrarlo a admins en el detalle. Aditiva: NULL en ítems
-- históricos (previos a esta feature).

-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN "pricingBreakdown" JSONB;
