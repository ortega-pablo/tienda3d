-- Nuevo parámetro global: hora de diseño 3D ($/h).
--
-- Se cobra como surcharge plano por línea en cotizaciones a medida (ADHOC):
-- diseñar un modelo es trabajo de única vez aunque se impriman N unidades,
-- así que no escala con la cantidad. Paga comisión de canal y régimen
-- igual que el resto del lineTotal.
INSERT INTO "global_params" ("key", "value", "description", "updatedAt")
VALUES (
  'design_hour_cost',
  '0',
  'Valor hora de diseño 3D (ARS) — surcharge plano por línea ADHOC',
  NOW()
)
ON CONFLICT ("key") DO NOTHING;
