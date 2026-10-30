-- Los pedidos sin pagar vencen (F22·4, D19): hasta cuándo se puede pagar y
-- cuándo se avisó que vence. Los pedidos de antes quedan sin plazo (null): el
-- vencimiento solo cancela los que lo tienen.
ALTER TABLE "web_orders"
  ADD COLUMN "paymentDueAt" TIMESTAMP(3),
  ADD COLUMN "paymentReminderAt" TIMESTAMP(3);

CREATE INDEX "web_orders_paymentDueAt_idx" ON "web_orders"("paymentDueAt");
