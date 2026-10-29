-- F14·6: el pago del pedido web lo maneja el sitio; un aviso viejo no pisa uno nuevo.
ALTER TABLE "web_orders" ADD COLUMN "paymentChangedAt" TIMESTAMP(3);
