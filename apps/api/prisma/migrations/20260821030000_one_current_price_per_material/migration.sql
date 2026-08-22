-- Un solo precio vigente por insumo.
--
-- El costeo lee el precio con `where: { isCurrent: true }, take: 1` y SIN
-- orderBy. La unicidad de `isCurrent` dependía enteramente de que todas las
-- escrituras pasaran por MaterialPricesService; no había ninguna restricción en
-- la base. Si dos filas quedaban vigentes —por un import, un restore parcial o
-- un bug futuro— el costo de ese insumo pasaba a depender del plan de query:
-- podía cambiar entre dos ejecuciones idénticas.
--
-- Antes de crear el índice hay que resolver los duplicados que ya existan. Se
-- conserva el más reciente por `registeredAt` (el criterio que el servicio usa
-- para ordenar el historial) y se apagan los demás.
UPDATE "supplier_materials" sm
SET "isCurrent" = false
WHERE sm."isCurrent"
  AND sm."id" <> (
    SELECT s2."id"
    FROM "supplier_materials" s2
    WHERE s2."materialId" = sm."materialId"
      AND s2."isCurrent"
    ORDER BY s2."registeredAt" DESC, s2."id" DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX "supplier_materials_one_current_per_material"
  ON "supplier_materials" ("materialId")
  WHERE "isCurrent";
