-- Arrepentimiento de una compra (F23·3): lo pide el cliente en el sitio y lo cierra el panel.
ALTER TABLE "web_orders"
  ADD COLUMN "withdrawalCode" TEXT,
  ADD COLUMN "withdrawalRequestedAt" TIMESTAMP(3),
  ADD COLUMN "withdrawalResolvedAt" TIMESTAMP(3);
