-- Pedidos B2B de la tienda (F21·3, D18): entran como cotización enviada.
-- `externalId` es el id del pedido en el sitio; sin usuario: lo mandó el cliente.
ALTER TABLE "quotes"
  ADD COLUMN "externalId" TEXT,
  ALTER COLUMN "createdById" DROP NOT NULL;

CREATE UNIQUE INDEX "quotes_externalId_key" ON "quotes"("externalId");

-- Los colores que eligió el cliente: { pieza: color }, como la orden de producción.
ALTER TABLE "quote_items" ADD COLUMN "filamentOverrides" JSONB;
