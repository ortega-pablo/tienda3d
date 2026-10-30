-- Cobros manuales con su prueba (F22·3): lo que se vio acreditado o se cobró en
-- el local y, en una transferencia, el número de operación del banco.
ALTER TABLE "web_orders"
  ADD COLUMN "paidAmountCents" INTEGER,
  ADD COLUMN "paymentReference" TEXT;
