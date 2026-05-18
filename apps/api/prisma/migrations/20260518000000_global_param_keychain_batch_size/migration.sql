-- Plan: docs/plans/keychain-batch-of-5.md (Fase 1)
--
-- Nuevo global param `keychain_batch_size`: cantidad de llaveros que
-- entran en una bandeja de impresión típica. Los inputs (gramos, minutos,
-- consumos) del flujo de cotización de llaveros se interpretan como
-- totales para este batch, y el sistema divide internamente para
-- calcular el costo por unidad. Default 5.

INSERT INTO "global_params" ("key", "value", "description", "updatedAt")
VALUES (
  'keychain_batch_size',
  '5',
  'Tamaño del batch de llaveros — los inputs de la cotización son totales para esta cantidad',
  NOW()
)
ON CONFLICT ("key") DO NOTHING;
