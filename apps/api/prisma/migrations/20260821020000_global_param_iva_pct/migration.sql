-- Alícuota de IVA configurable.
--
-- El motor de precios tenía `1.21` hardcodeado en dos ramas de computeTaxes,
-- mientras todo el resto de las tasas (régimen unificado, comisión de venta
-- directa, IIBB, retenciones, paso de redondeo) ya era configurable. El IVA es
-- justamente el que cambia por decisión ajena al taller, y era el único que
-- exigía un deploy.
INSERT INTO "global_params" ("key", "value", "description", "updatedAt")
VALUES (
  'iva_pct',
  '21',
  'Alícuota de IVA (%) aplicada a los canales con taxMode DETALLADO y appliesIva. Cambiala acá si cambia la alícuota general.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
