-- Mercado Pago blindado (F22·5): un contracargo deja el pago en disputa, y el
-- pedido guarda cuánto se devolvió (el reembolso puede ser parcial).
ALTER TYPE "WebOrderPayment" ADD VALUE IF NOT EXISTS 'DISPUTED';

ALTER TABLE "web_orders" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0;
