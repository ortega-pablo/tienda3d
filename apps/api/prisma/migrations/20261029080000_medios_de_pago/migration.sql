-- Medios de pago de la tienda, cada uno con su switch en el panel (F22·2, D19).

-- Efectivo en el local, MODO y Go Cuotas, además de Mercado Pago y transferencia.
ALTER TYPE "WebPaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';
ALTER TYPE "WebPaymentMethod" ADD VALUE IF NOT EXISTS 'MODO';
ALTER TYPE "WebPaymentMethod" ADD VALUE IF NOT EXISTS 'GOCUOTAS';
-- Un pedido en efectivo espera el pago en el local.
ALTER TYPE "WebOrderPayment" ADD VALUE IF NOT EXISTS 'AWAITING_CASH';

-- Mercado Pago queda prendido (es lo que la tienda ofrecía hasta ahora); los nuevos, apagados.
ALTER TABLE "ecommerce_settings"
  ADD COLUMN "cashEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mercadoPagoEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "modoEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "goCuotasEnabled" BOOLEAN NOT NULL DEFAULT false;

-- La vista suma las columnas al final: es un cambio compatible del contrato v1.
CREATE OR REPLACE VIEW storefront_v1.store_settings WITH (security_barrier) AS
SELECT
  (s."shippingFlatRate" * 100)::int AS shipping_flat_rate_cents,
  (s."freeShippingFrom" * 100)::int AS free_shipping_from_cents,
  COALESCE(s."pickupEnabled", true) AS pickup_enabled,
  COALESCE(s."pickupInstructions", '') AS pickup_instructions,
  COALESCE(s."bankTransferEnabled", false) AS bank_transfer_enabled,
  COALESCE(s."bankTransferInstructions", '') AS bank_transfer_instructions,
  COALESCE(s."notificationEmail", '') AS notification_email,
  COALESCE(s."cashEnabled", false) AS cash_enabled,
  COALESCE(s."mercadoPagoEnabled", true) AS mercadopago_enabled,
  COALESCE(s."modoEnabled", false) AS modo_enabled,
  COALESCE(s."goCuotasEnabled", false) AS gocuotas_enabled
FROM (SELECT 1 AS id) one
LEFT JOIN public.ecommerce_settings s ON s.id = one.id;

-- Cobros, plazos, reembolsos y medios de pago: un permiso aparte de gestionar
-- pedidos (F22·3, amenaza A14). Solo para el rol admin.
INSERT INTO "permissions" ("id", "key", "description")
VALUES ('ecom_perm_payments', 'ecommerce:payments', 'Prender y apagar medios de pago, confirmar cobros, extender plazos y reembolsar')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'admin' AND p."key" = 'ecommerce:payments'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
