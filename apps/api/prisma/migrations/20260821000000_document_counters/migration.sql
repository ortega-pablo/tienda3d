-- Contador atómico de códigos de documento (cotizaciones y órdenes de producción).
--
-- Antes cada `nextCode()` leía el último código con ORDER BY code DESC, le
-- sumaba 1 y creaba la fila fuera de esa lectura: dos creaciones simultáneas
-- calculaban el mismo número y la segunda chocaba contra el índice único de
-- `code` con un 409 sin explicación.
--
-- Se usa una tabla de contadores en vez de una SEQUENCE de Postgres porque el
-- prefijo lleva el año (Q-2026-0001) y una secuencia global no reinicia sola.
-- Al incluir el año en el `scope`, el reinicio anual sale gratis: el primer
-- documento de 2027 crea su propia fila arrancando en 1.
--
-- El incremento es una sola sentencia (INSERT ... ON CONFLICT DO UPDATE
-- RETURNING), así que Postgres serializa los concurrentes sobre el row lock.

CREATE TABLE "document_counters" (
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("scope")
);

-- Semilla desde los datos existentes: el contador arranca en el máximo actual
-- de cada (letra, año) para no repetir un código ya emitido.
-- Formato de cotización: Q-YYYY-NNNN / R-YYYY-NNNN
INSERT INTO "document_counters" ("scope", "value")
SELECT
    'QUOTE:' || left("code", 1) || ':' || substring("code" from 3 for 4),
    MAX(CAST(substring("code" from 8) AS INTEGER))
FROM "quotes"
WHERE "code" ~ '^[QR]-[0-9]{4}-[0-9]+$'
GROUP BY 1
ON CONFLICT ("scope") DO NOTHING;

-- Formato de orden de producción: OP-YYYY-NNNN
INSERT INTO "document_counters" ("scope", "value")
SELECT
    'PRODUCTION:OP:' || substring("code" from 4 for 4),
    MAX(CAST(substring("code" from 9) AS INTEGER))
FROM "production_orders"
WHERE "code" ~ '^OP-[0-9]{4}-[0-9]+$'
GROUP BY 1
ON CONFLICT ("scope") DO NOTHING;
