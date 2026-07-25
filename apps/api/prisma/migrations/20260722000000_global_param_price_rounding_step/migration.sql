-- Plan: docs/plans/price-rounding.md (Fase 1)
--
-- Nuevo global param `price_rounding_step`: los precios finales de venta al
-- cliente se redondean hacia arriba a este múltiplo (ARS). Default 50.
-- 0 desactiva el redondeo (precios exactos). No afecta costos ni márgenes.

INSERT INTO "global_params" ("key", "value", "description", "updatedAt")
VALUES (
  'price_rounding_step',
  '50',
  'Paso de redondeo de los precios finales de venta (ARS). Los precios al cliente se redondean hacia arriba a este múltiplo. 0 = sin redondeo.',
  NOW()
)
ON CONFLICT ("key") DO NOTHING;
